"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Preferences = {
  id?: string;
  citoyen_id?: string;
  localisation_autorisee: boolean;
  notif_sms: boolean;
  notif_email: boolean;
  notif_push: boolean;
  notif_rdv_rappel: boolean;
  notif_rdv_confirmation: boolean;
  notif_rdv_annulation: boolean;
  marketing_email: boolean;
  marketing_sms: boolean;
  newsletter: boolean;
  profil_public: boolean;
  partage_donnees_partenaires: boolean;
  historique_rdv_visible: boolean;
  langue: string;
  theme: string;
  double_auth: boolean;
  alertes_connexion: boolean;
};

type Citoyen = {
  id: string;
  email?: string;
  phone?: string;
  nom?: string;
  prenom?: string;
  name?: string;
};

const DEFAULTS: Omit<Preferences, "id" | "citoyen_id"> = {
  localisation_autorisee: false,
  notif_sms: true,
  notif_email: true,
  notif_push: false,
  notif_rdv_rappel: true,
  notif_rdv_confirmation: true,
  notif_rdv_annulation: true,
  marketing_email: false,
  marketing_sms: false,
  newsletter: false,
  profil_public: false,
  partage_donnees_partenaires: false,
  historique_rdv_visible: true,
  langue: "fr",
  theme: "sombre",
  double_auth: false,
  alertes_connexion: true,
};

/* ─── Logo YELEN224 — identique à l'app ─────────────────────────────────── */
function YelenLogo({ size = "sm" }: { size?: "sm" | "md" }) {
  const box = size === "md" ? 36 : 30;
  const icon = size === "md" ? 17 : 14;
  const fs = size === "md" ? "13px" : "11px";
  const sub = size === "md" ? "7px" : "6px";
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
      <div style={{
        width: `${box}px`, height: `${box}px`,
        background: "linear-gradient(135deg,#F5A623,#C8940A)",
        borderRadius: "9px",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(245,166,35,0.35)",
        flexShrink: 0,
      }}>
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: fs, fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>YELEN224</div>
        <div style={{ fontSize: sub, fontWeight: 700, color: "#F5A623", letterSpacing: "1.5px", marginTop: "1px" }}>GUINÉE</div>
      </div>
    </Link>
  );
}

/* ─── Toggle ──────────────────────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled = false, color = "#F5A623" }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean; color?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-checked={value}
      role="switch"
      style={{
        width: "50px", height: "29px", borderRadius: "15px", border: "none",
        background: value ? color : "rgba(255,255,255,0.1)",
        position: "relative", cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.25s", flexShrink: 0,
        opacity: disabled ? 0.45 : 1, padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: "3.5px",
        left: value ? "24px" : "3.5px",
        width: "22px", height: "22px", borderRadius: "50%",
        background: "#fff", transition: "left 0.22s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </button>
  );
}

/* ─── SettingRow ──────────────────────────────────────────────────────────── */
function SettingRow({ label, description, value, onChange, disabled, color }: {
  label: string; description?: string; value: boolean;
  onChange: (v: boolean) => void; disabled?: boolean; color?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "12px", padding: "14px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 500, color: "#F0F6FC" }}>{label}</div>
        {description && (
          <div style={{ fontSize: "12px", color: "#6E7681", marginTop: "2px", lineHeight: 1.4 }}>{description}</div>
        )}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} color={color} />
    </div>
  );
}

/* ─── SectionCard ─────────────────────────────────────────────────────────── */
function SectionCard({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#161B22",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "18px", padding: "18px 20px", marginBottom: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.09em" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ─── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", bottom: "110px", left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)",
      color: "#fff", fontSize: "13px", fontWeight: 700,
      padding: "10px 22px", borderRadius: "22px", zIndex: 200,
      whiteSpace: "nowrap", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      {type === "success" ? "✓ " : "✗ "}{message}
    </div>
  );
}

/* ══ PAGE PRINCIPALE ════════════════════════════════════════════════════════ */

export default function ParametresPage() {
  const router = useRouter();

  const [citoyen, setCitoyen] = useState<Citoyen | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  /* ── Charger citoyen + préférences ── */
  useEffect(() => {
    async function load() {
      setLoading(true);

      /* Auth — même méthode que l'app (localStorage userId) */
      const userId = localStorage.getItem(YELEN224_USER_ID_KEY);
      if (!userId) { router.push("/login"); return; }

      /* Profil depuis table users (comme login.tsx) */
      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, prenom, nom, name, phone")
        .eq("id", userId)
        .maybeSingle();

      if (userErr || !user) { router.push("/login"); return; }

      const u = user as Citoyen & { prenom?: string; nom?: string; name?: string };
      setCitoyen({
        id: String(u.id),
        phone: u.phone,
        nom: u.nom,
        prenom: u.prenom,
        name: u.name,
      });

      /* Préférences */
      const { data: existingPrefs } = await supabase
        .from("citoyen_preferences")
        .select("*")
        .eq("citoyen_id", userId)
        .maybeSingle();

      if (existingPrefs) {
        setPrefs(existingPrefs as Preferences);
      } else {
        const { data: newPrefs } = await supabase
          .from("citoyen_preferences")
          .insert({ citoyen_id: userId, ...DEFAULTS })
          .select()
          .single();
        if (newPrefs) setPrefs(newPrefs as Preferences);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  /* ── Modifier une préférence ── */
  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  /* ── Sauvegarder ── */
  const save = useCallback(async () => {
    if (!citoyen || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("citoyen_preferences")
        .upsert(
          { citoyen_id: citoyen.id, ...prefs, updated_at: new Date().toISOString() },
          { onConflict: "citoyen_id" }
        );
      if (error) throw error;
      setHasChanges(false);
      setToast({ message: "Préférences enregistrées", type: "success" });
    } catch {
      setToast({ message: "Erreur lors de la sauvegarde", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [citoyen, prefs, saving]);

  /* ── Déconnexion ── */
  const logout = useCallback(async () => {
    localStorage.removeItem(YELEN224_USER_ID_KEY);
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

  /* ── Initiales ── */
  const nomComplet = citoyen?.prenom && citoyen?.nom
    ? `${citoyen.prenom} ${citoyen.nom}`.trim()
    : citoyen?.name ?? "Citoyen";

  const initiales = nomComplet
    .split(" ").filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("") || "C";

  const phoneDisplay = citoyen?.phone?.replace("+224", "") ?? "";

  /* ══ LOADING ════════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div style={{
        minHeight: "100svh", background: "#080812",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "20px",
      }}>
        <div style={{
          width: "56px", height: "56px", borderRadius: "14px",
          background: "linear-gradient(135deg,#F5A623,#C8940A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(245,166,35,0.4)",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
        </div>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(245,166,35,0.15)" strokeWidth="3"/>
          <path d="M12 2 A10 10 0 0 1 22 12" stroke="#F5A623" strokeWidth="3" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
          </path>
        </svg>
      </div>
    );
  }

  /* ══ RENDER ════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: "100svh", background: "#080812",
      color: "#E6EDF3",
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif",
      maxWidth: "430px", margin: "0 auto",
      position: "relative", paddingBottom: "120px",
    }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{background:#080812;overflow-x:hidden}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ══ HERO DORÉ — style TikTok/app ══════════════════════════════════ */}
      <div style={{
        background: "linear-gradient(160deg,#F5A623 0%,#E8960A 55%,#C8740A 100%)",
        padding: "52px 24px 30px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Cercles déco */}
        <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "210px", height: "210px", borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-50px", left: "-30px", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(0,0,0,0.06)", pointerEvents: "none" }} />

        {/* Drapeau guinéen */}
        <div style={{ position: "absolute", top: "16px", right: "20px", display: "flex", opacity: 0.45 }}>
          <div style={{ width: "9px", height: "16px", background: "#CE1126", borderRadius: "2px 0 0 2px" }} />
          <div style={{ width: "9px", height: "16px", background: "#FCD20F" }} />
          <div style={{ width: "9px", height: "16px", background: "#009A44", borderRadius: "0 2px 2px 0" }} />
        </div>

        {/* Logo YELEN224 vrai */}
        <div style={{ marginBottom: "26px" }}>
          <YelenLogo size="sm" />
        </div>

        {/* Avatar + identité citoyen */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "50%",
            background: "rgba(0,0,0,0.18)",
            border: "2.5px solid rgba(255,255,255,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", fontWeight: 900, color: "#fff",
            flexShrink: 0, letterSpacing: "-0.02em",
          }}>
            {initiales}
          </div>
          <div>
            <div style={{ fontSize: "19px", fontWeight: 900, color: "#080812", lineHeight: 1.1, letterSpacing: "-0.01em" }}>
              {nomComplet}
            </div>
            {phoneDisplay && (
              <div style={{ fontSize: "13px", color: "rgba(0,0,0,0.5)", marginTop: "3px", fontWeight: 600 }}>
                +224 {phoneDisplay}
              </div>
            )}
          </div>
        </div>

        {/* Titre */}
        <div style={{ marginTop: "22px" }}>
          <h1 style={{ fontSize: "30px", fontWeight: 900, color: "#080812", letterSpacing: "-0.025em", lineHeight: 1, margin: 0 }}>
            Paramètres
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(0,0,0,0.48)", marginTop: "4px", fontWeight: 600 }}>
            Gérez vos préférences de compte
          </p>
        </div>
      </div>

      {/* ══ CONTENU ═══════════════════════════════════════════════════════ */}
      <div style={{ padding: "16px 14px 0", animation: "fadeUp 0.3s ease" }}>

        {/* ── Localisation ── */}
        <SectionCard icon="📍" title="Localisation">
          <SettingRow
            label="Autoriser ma localisation"
            description="Prestataires proches de vous en priorité"
            value={prefs.localisation_autorisee}
            onChange={(v) => update("localisation_autorisee", v)}
            color="#F5A623"
          />
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionCard icon="🔔" title="Notifications">
          <SettingRow label="SMS" description="Alertes par SMS sur votre numéro" value={prefs.notif_sms} onChange={(v) => update("notif_sms", v)} />
          <SettingRow label="Email" description="Alertes sur votre adresse email" value={prefs.notif_email} onChange={(v) => update("notif_email", v)} />
          <SettingRow label="Notifications push" description="Alertes en temps réel sur l'appareil" value={prefs.notif_push} onChange={(v) => update("notif_push", v)} />
          <div style={{ paddingTop: "10px", marginTop: "6px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#6E7681", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Alertes RDV</div>
          </div>
          <SettingRow label="Rappels de RDV" description="24h avant votre rendez-vous" value={prefs.notif_rdv_rappel} onChange={(v) => update("notif_rdv_rappel", v)} />
          <SettingRow label="Confirmation de RDV" description="Quand votre RDV est accepté" value={prefs.notif_rdv_confirmation} onChange={(v) => update("notif_rdv_confirmation", v)} />
          <SettingRow label="Annulation de RDV" description="Si un RDV est annulé" value={prefs.notif_rdv_annulation} onChange={(v) => update("notif_rdv_annulation", v)} />
        </SectionCard>

        {/* ── Marketing ── */}
        <SectionCard icon="📣" title="Communication & Marketing">
          <SettingRow label="Emails marketing" description="Offres et actualités YELEN224" value={prefs.marketing_email} onChange={(v) => update("marketing_email", v)} color="#8B5CF6" />
          <SettingRow label="SMS marketing" description="Promotions et offres par SMS" value={prefs.marketing_sms} onChange={(v) => update("marketing_sms", v)} color="#8B5CF6" />
          <SettingRow label="Newsletter officielle" description="Actualités de l'État guinéen" value={prefs.newsletter} onChange={(v) => update("newsletter", v)} color="#8B5CF6" />
        </SectionCard>

        {/* ── Confidentialité ── */}
        <SectionCard icon="🔒" title="Confidentialité">
          <SettingRow label="Profil public" description="Visible par les prestataires" value={prefs.profil_public} onChange={(v) => update("profil_public", v)} color="#F59E0B" />
          <SettingRow label="Historique RDV visible" description="Prestataires voient vos RDV passés" value={prefs.historique_rdv_visible} onChange={(v) => update("historique_rdv_visible", v)} color="#F59E0B" />
          <SettingRow label="Partage données partenaires" description="Données anonymisées — améliore les recommandations" value={prefs.partage_donnees_partenaires} onChange={(v) => update("partage_donnees_partenaires", v)} color="#F59E0B" />
        </SectionCard>

        {/* ── Sécurité ── */}
        <SectionCard icon="🛡️" title="Sécurité">
          <SettingRow label="Double authentification" description="Code SMS à chaque connexion (recommandé)" value={prefs.double_auth} onChange={(v) => update("double_auth", v)} color="#22C55E" />
          <SettingRow label="Alertes de connexion" description="Notification à chaque nouvelle connexion" value={prefs.alertes_connexion} onChange={(v) => update("alertes_connexion", v)} color="#22C55E" />
        </SectionCard>

        {/* ── Langue ── */}
        <SectionCard icon="🌍" title="Langue & Affichage">
          <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#F0F6FC", marginBottom: "10px" }}>Langue de l&apos;interface</div>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              {[
                { code: "fr", label: "Français" },
                { code: "en", label: "English" },
                { code: "ar", label: "عربي" },
                { code: "ff", label: "Pular" },
                { code: "mn", label: "Malinké" },
              ].map((lang) => (
                <button key={lang.code} onClick={() => update("langue", lang.code)} className="tap" style={{
                  padding: "7px 14px", borderRadius: "20px",
                  border: `1px solid ${prefs.langue === lang.code ? "#F5A623" : "rgba(255,255,255,0.1)"}`,
                  background: prefs.langue === lang.code ? "rgba(245,166,35,0.12)" : "transparent",
                  color: prefs.langue === lang.code ? "#F5A623" : "#8B949E",
                  fontSize: "13px", fontWeight: prefs.langue === lang.code ? 700 : 400, cursor: "pointer",
                }}>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "12px 0" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#F0F6FC", marginBottom: "10px" }}>Thème</div>
            <div style={{ display: "flex", gap: "7px" }}>
              {[{ code: "sombre", label: "🌙 Sombre" }, { code: "clair", label: "☀️ Clair" }, { code: "auto", label: "🔄 Auto" }].map((t) => (
                <button key={t.code} onClick={() => update("theme", t.code)} className="tap" style={{
                  flex: 1, padding: "9px 6px", borderRadius: "12px",
                  border: `1px solid ${prefs.theme === t.code ? "#F5A623" : "rgba(255,255,255,0.1)"}`,
                  background: prefs.theme === t.code ? "rgba(245,166,35,0.1)" : "rgba(255,255,255,0.03)",
                  color: prefs.theme === t.code ? "#F5A623" : "#8B949E",
                  fontSize: "13px", fontWeight: prefs.theme === t.code ? 700 : 400, cursor: "pointer",
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── Mon Compte ── */}
        <SectionCard icon="👤" title="Mon Compte">
          {[
            { label: "Modifier mon profil", path: "/profil" },
            { label: "Mes rendez-vous", path: "/mes-rdv" },
            { label: "Mes messages", path: "/messagerie" },
            { label: "Mes documents", path: "/dashboard" },
          ].map((item, i, arr) => (
            <button key={item.path} onClick={() => router.push(item.path)} className="tap" style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 0", background: "none", border: "none", cursor: "pointer",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#F0F6FC" }}>{item.label}</span>
              <span style={{ color: "#6E7681", fontSize: "20px", lineHeight: 1 }}>›</span>
            </button>
          ))}
        </SectionCard>

        {/* ── Légal ── */}
        <SectionCard icon="📋" title="Informations légales">
          {[
            { label: "Conditions d'utilisation", path: "/cgu" },
            { label: "Politique de confidentialité", path: "/confidentialite" },
            { label: "Politique cookies", path: "/politique-cookies" },
            { label: "Mentions légales", path: "/mentions-legales" },
          ].map((item, i, arr) => (
            <button key={item.path} onClick={() => router.push(item.path)} className="tap" style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 0", background: "none", border: "none", cursor: "pointer",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: "14px", color: "#8B949E" }}>{item.label}</span>
              <span style={{ color: "#6E7681", fontSize: "20px", lineHeight: 1 }}>›</span>
            </button>
          ))}
        </SectionCard>

        {/* Version */}
        <div style={{ textAlign: "center", padding: "6px 0 14px", fontSize: "11px", color: "#3C444D" }}>
          YELEN224 · République de Guinée · v1.0.0
        </div>

        {/* Déconnexion */}
        <button onClick={logout} className="tap" style={{
          width: "100%", padding: "14px", borderRadius: "14px",
          border: "1px solid rgba(239,68,68,0.22)",
          background: "rgba(239,68,68,0.06)",
          color: "#F87171", fontSize: "14px", fontWeight: 700,
          cursor: "pointer", marginBottom: "10px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Se déconnecter
        </button>

        {/* Footer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "16px", height: "11px", background: "#CE1126", borderRadius: "2px 0 0 2px" }} />
            <div style={{ width: "16px", height: "11px", background: "#FCD20F" }} />
            <div style={{ width: "16px", height: "11px", background: "#009A44", borderRadius: "0 2px 2px 0" }} />
            <span style={{ color: "#6E7681", fontSize: "10px", fontWeight: 600 }}>République de Guinée</span>
          </div>
        </div>
      </div>

      {/* ══ BARRE SAVE FLOTTANTE ══════════════════════════════════════════ */}
      {hasChanges && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: "430px",
          padding: "12px 14px 20px",
          background: "rgba(8,8,18,0.98)",
          borderTop: "1px solid rgba(245,166,35,0.2)",
          backdropFilter: "blur(20px)",
          zIndex: 50, display: "flex", gap: "10px",
        }}>
          <button onClick={() => { setHasChanges(false); }} className="tap" style={{
            flex: 1, height: "48px", borderRadius: "13px",
            border: "1px solid rgba(255,255,255,0.09)",
            background: "transparent", color: "#8B949E",
            fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>
            Annuler
          </button>
          <button onClick={save} disabled={saving} className="tap" style={{
            flex: 2, height: "48px", borderRadius: "13px", border: "none",
            background: saving ? "rgba(245,166,35,0.4)" : "linear-gradient(135deg,#F5A623,#C8940A)",
            color: "#080812", fontSize: "14px", fontWeight: 800,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "0 4px 20px rgba(245,166,35,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {saving ? (
              <>
                <div style={{ width: "15px", height: "15px", border: "2px solid rgba(8,8,18,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                Enregistrement…
              </>
            ) : (
              <>✓ Enregistrer</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}