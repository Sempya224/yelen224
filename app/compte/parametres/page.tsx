"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { deleteCitoyenAccount } from "@/app/profil/actions";
import { LogoutFlow, CITOYEN_LOGOUT_COPY } from "@/components/LogoutFlow";

// Écran "Paramètres" — décision CEO 18/07/2026 : plus une simple section
// qui se dépliait dans l'onglet Compte, mais un écran dédié à part
// entière. Restructuré le 24/08/2026 vers un rendu "liste groupée" façon
// Gmail (une seule carte par section, lignes fines séparées par un trait,
// plus dense) — retour Bryan explicite : pas d'icônes dorées flottantes
// ici (le bandeau du header porte déjà la couleur de marque), icônes en
// noir/gris neutre uniquement. "Supprimer mon compte" retiré de cet écran
// (24/08/2026, retour Bryan) — déjà disponible dans
// /compte/informations-personnelles, pas de doublon. Ordre des lignes
// fixe, imposé par le brief CEO — ne pas réordonner sans nouvelle
// décision produit.
const P = { pointerEvents: "none" as const };
const Ic = {
  Shield: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Lock:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Bell:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Globe:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Down:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Access: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  Signal: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="20" x2="4" y2="14"/><line x1="10" y1="20" x2="10" y2="10"/><line x1="16" y1="20" x2="16" y2="6"/><line x1="22" y1="20" x2="22" y2="2"/></svg>,
  Drive:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="14" x2="6.01" y2="14"/><line x1="10" y1="14" x2="10.01" y2="14"/></svg>,
  Sound:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  Info:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Chev:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Out:    () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Trash:  () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
};

// Sélecteur de thème inline — retiré de l'écran dédié /compte/apparence
// (retour Bryan 18/07/2026 : "les choix du thème s'affichent direct, tu
// choisis le dark sans cliquer ouvrir un nouvel écran"), mirroring le
// sélecteur déjà utilisé côté institution
// (app/institution/[id]/dashboard/page.tsx, section "Apparence").
const THEME_OPTIONS: { key: ThemeMode; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: "system", label: "Système", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    ) },
  { key: "light", label: "Clair", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    ) },
  { key: "dark", label: "Sombre", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    ) },
];

function ApparenceCard({ mode, setMode, card, brd, t1, t2, isDark }: {
  mode: ThemeMode; setMode: (m: ThemeMode) => void;
  card: string; brd: string; t1: string; t2: string; isDark: boolean;
}) {
  return (
    <div style={{ backgroundColor: card, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
      <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Apparence</div>
      <div style={{ color: t2, fontSize: "12.5px", marginBottom: "12px" }}>« Système » suit les réglages de votre appareil.</div>
      <div style={{ display: "flex", gap: "8px" }}>
        {THEME_OPTIONS.map((opt) => {
          const selected = mode === opt.key;
          return (
            <button
              key={opt.key} onClick={() => setMode(opt.key)} className="tap"
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 8px",
                borderRadius: "12px", backgroundColor: selected ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)") : "transparent",
                border: `1.5px solid ${selected ? t1 : brd}`, cursor: "pointer",
              }}
            >
              {opt.icon(selected ? t1 : t2)}
              <span style={{ color: selected ? t1 : t2, fontSize: "12px", fontWeight: selected ? 700 : 500 }}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Profil = { prenom: string | null; nom: string | null; phone: string | null; email: string | null; photo_url: string | null };

function initiales(prenom: string | null, nom: string | null): string {
  const a = prenom?.trim()?.[0]?.toUpperCase() ?? "";
  const b = nom?.trim()?.[0]?.toUpperCase() ?? "";
  return (a + b) || "?";
}

// Bandeau compte en tête d'écran — retour Bryan 24/08/2026, référence
// WhatsApp/Gmail (avatar + identité, carte cliquable vers le profil).
// Photo servie par le bucket public "avatars" (voir
// app/api/citoyen/profil/photo/route.ts) : next/image direct, couvert par
// next.config.ts::remotePatterns, pas d'IMG-EXCEPTION nécessaire ici.
function CompteBanner({ profil, loading, card, brd, t1, t2, t3, avatarBg }: {
  profil: Profil | null; loading: boolean;
  card: string; brd: string; t1: string; t2: string; t3: string; avatarBg: string;
}) {
  if (loading) {
    return <div style={{ backgroundColor: card, borderRadius: "14px", marginBottom: "24px", height: "84px" }}/>;
  }
  if (!profil) return null;
  const nomComplet = [profil.prenom, profil.nom].filter(Boolean).join(" ").trim() || "Mon compte";
  const sousTitre = profil.phone || profil.email || "";
  return (
    <Link href="/compte/informations-personnelles" className="tap" style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: card, borderRadius: "14px", padding: "14px 16px", marginBottom: "24px", textDecoration: "none" }}>
      <div style={{ width: "52px", height: "52px", borderRadius: "16px", overflow: "hidden", flexShrink: 0, background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {profil.photo_url ? (
          <Image src={profil.photo_url} alt="" width={52} height={52} style={{ objectFit: "cover", width: "100%", height: "100%" }}/>
        ) : (
          <span style={{ color: t1, fontSize: "18px", fontWeight: 900 }}>{initiales(profil.prenom, profil.nom)}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: 800 }}>{nomComplet}</div>
        {sousTitre && <div style={{ color: t2, fontSize: "13px", marginTop: "2px" }}>{sousTitre}</div>}
      </div>
      <div style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></div>
    </Link>
  );
}

type Ligne = { icon: React.ReactNode; titre: string; href: string };

const PARAMETRES_COMPTE: Ligne[] = [
  { icon: <Ic.Shield/>, titre: "Sécurité",               href: "/compte/securite" },
  { icon: <Ic.Lock/>,   titre: "Confidentialité",         href: "/compte/confidentialite" },
  { icon: <Ic.Bell/>,   titre: "Notifications",           href: "/compte/notifications" },
  { icon: <Ic.Globe/>,  titre: "Langue",                  href: "/compte/langue" },
  { icon: <Ic.Down/>,   titre: "Télécharger mes données", href: "/compte/mes-donnees" },
];

const PARAMETRES_APPLICATION: Ligne[] = [
  { icon: <Ic.Access/>,  titre: "Accessibilité",          href: "/compte/accessibilite" },
  { icon: <Ic.Signal/>,  titre: "Utilisation des données", href: "/compte/donnees-mobiles" },
  { icon: <Ic.Drive/>,   titre: "Stockage",               href: "/compte/stockage" },
  { icon: <Ic.Sound/>,   titre: "Sons et vibrations",     href: "/compte/sons" },
  { icon: <Ic.Info/>,    titre: "Version",                href: "/compte/version" },
];

// Définies au niveau module — jamais à l'intérieur du composant (piège
// React déjà rencontré et corrigé sur les écrans Sécurité/Confidentialité :
// un composant redéfini à chaque rendu perd le focus de ses champs internes).
// Une seule carte par groupe, lignes séparées par un trait fin — rendu
// "liste groupée" façon Gmail plutôt que des cartes individuelles.
function LignesCarte({ lignes, card, brd, t1, t2, t3 }: {
  lignes: Ligne[]; card: string; brd: string; t1: string; t2: string; t3: string;
}) {
  return (
    <div style={{ backgroundColor: card, borderRadius: "14px", overflow: "hidden" }}>
      {lignes.map((l, i) => (
        <Link
          key={l.titre} href={l.href} className="tap"
          style={{
            display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px",
            borderBottom: i < lignes.length - 1 ? `1px solid ${brd}` : "none",
            textDecoration: "none",
          }}
        >
          <div style={{ color: t2, display: "flex", flexShrink: 0 }}>{l.icon}</div>
          <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "15px", fontWeight: 600 }}>{l.titre}</div>
          <div style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></div>
        </Link>
      ))}
    </div>
  );
}

function Section({ titre, lignes, card, brd, t1, t2, t3, children }: {
  titre: string; lignes: Ligne[];
  card: string; brd: string; t1: string; t2: string; t3: string;
  children?: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "28px" }}>
      <div style={{ color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{titre}</div>
      {children}
      <LignesCarte lignes={lignes} card={card} brd={brd} t1={t1} t2={t2} t3={t3}/>
    </section>
  );
}

export default function ParametresPage() {
  const router = useRouter();
  const { theme, mode, setMode } = useTheme();
  const isDark = theme === "dark";
  const bg       = isDark ? "#0A0A0F" : "#F2F2F7";
  const card     = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1       = isDark ? "#FFFFFF" : "#000000";
  const t2       = isDark ? "#8E8E93" : "#6C6C70";
  const t3       = isDark ? "#636366" : "#AEAEB2";
  const brd      = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const avatarBg = isDark ? "#2C2C2E" : "#E5E5EA";

  const [userId, setUserId] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [profilLoading, setProfilLoading] = useState(true);
  // Déconnexion/Suppression — déplacées ici depuis
  // /compte/informations-personnelles (retour Bryan 27/08/2026, brief
  // "Profil → Paramètres → Compte") : même logique portée telle quelle
  // (LogoutFlow, deleteCitoyenAccount, window.confirm), aucun comportement
  // changé, seulement l'emplacement dans le produit.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { setProfilLoading(false); return; }
    setUserId(id);
    void (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("prenom,nom,phone,email,photo_url")
        .eq("id", id)
        .maybeSingle();
      if (!error) setProfil(data as Profil);
      setProfilLoading(false);
    })();
  }, []);

  async function handleDelete() {
    if (!userId) return;
    if (!window.confirm("Supprimer définitivement votre compte ? Cette action est irréversible.")) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { window.alert("Session expirée, reconnectez-vous."); return; }
      const result = await deleteCitoyenAccount(userId, session.access_token);
      if (!result.ok) { window.alert(result.error); return; }
      await supabase.auth.signOut();
      localStorage.removeItem(YELEN224_USER_ID_KEY);
      router.replace("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre="Paramètres"/>
      <main style={{ padding: "16px 16px 40px" }}>
        <CompteBanner profil={profil} loading={profilLoading} card={card} brd={brd} t1={t1} t2={t2} t3={t3} avatarBg={avatarBg}/>

        <Section titre="Paramètres du compte" lignes={PARAMETRES_COMPTE} card={card} brd={brd} t1={t1} t2={t2} t3={t3}/>

        <Section titre="Paramètres de l'application" lignes={PARAMETRES_APPLICATION} card={card} brd={brd} t1={t1} t2={t2} t3={t3}>
          <ApparenceCard mode={mode} setMode={setMode} card={card} brd={brd} t1={t1} t2={t2} isDark={isDark}/>
        </Section>

        <section style={{ marginBottom: "28px" }}>
          <div style={{ color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>Compte</div>
          <div style={{ backgroundColor: card, borderRadius: "14px", padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button type="button" onClick={() => setLogoutOpen(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "transparent", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                <Ic.Out/> Déconnexion
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontWeight: 700, fontSize: "13px", cursor: deleting ? "default" : "pointer" }}>
                <Ic.Trash/> {deleting ? "Suppression…" : "Supprimer mon compte"}
              </button>
            </div>
          </div>
        </section>
      </main>

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/login?logged_out=1"
          copy={CITOYEN_LOGOUT_COPY}
        />
      )}
    </div>
  );
}
