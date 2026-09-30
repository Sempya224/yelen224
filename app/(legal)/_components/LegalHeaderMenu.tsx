"use client";

// Menu du header du Centre légal (retour Bryan 23/09/2026) — passé d'un
// petit popover "Apparence" à un vrai menu plein écran façon DoorDash
// (overlay, X pour fermer), même pattern d'accessibilité que
// app/guide-prestataire/components/HeaderMobileMenu.tsx (piège de focus,
// fermeture Échap, retour du focus au déclencheur). Ordre demandé par
// Bryan : CTA Connexion/S'inscrire en haut, Apparence au milieu, Langue
// à la fin — la langue n'est donc plus une pilule séparée dans le header
// (voir LegalHeader.tsx), elle vit uniquement ici désormais. Langue
// volontairement cosmétique (voir LegalLanguageSwitcher.tsx) : seul
// Mentions légales a une vraie traduction anglaise sur les 5 documents.
// Overlay rendu via createPortal dans document.body (retour Bryan
// 23/09/2026, bug réel constaté) : LegalHeader a `backdropFilter:
// blur(20px)` sur le <header>, or filter/backdrop-filter crée un
// containing block CSS pour tout descendant `position: fixed` — sans le
// portail, l'overlay "plein écran" se retrouvait contraint à la hauteur
// du header (quelques dizaines de px) au lieu de couvrir tout le
// viewport, laissant voir la page en dessous.
import { createPortal } from "react-dom";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_LAST_UPDATED } from "@/lib/legalVersions";

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: "system", label: "Système", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    ) },
  { key: "light", label: "Clair", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    ) },
  { key: "dark", label: "Sombre", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    ) },
];

type LangCode = "fr" | "en" | "ar";
const LANGUAGES: { code: LangCode; label: string; comingSoon?: boolean }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English", comingSoon: true },
  { code: "ar", label: "العربية", comingSoon: true },
];
const ACTIVE_LANG: LangCode = "fr";

const ACCOUNT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
  </svg>
);
const DASHBOARD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="12" width="8" height="9" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>
  </svg>
);
const SHIELD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/>
  </svg>
);
const CHEVRON_RIGHT = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: "auto" }}>
    <polyline points="9 6 15 12 9 18"/>
  </svg>
);

const GEAR = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ color, fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>
      {children}
    </div>
  );
}

// Ancrage desktop (retour Bryan 23/09/2026 : plein écran correct sur
// mobile mais devait s'adapter sur PC) — même pattern que useDesktopAnchor
// dans app/[slug]/[id]/layout.tsx : ≥1024px uniquement, position calculée
// depuis le bouton déclencheur ; sous ce seuil, null pour laisser le menu
// plein écran inchangé.
function useDesktopAnchor(triggerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) { queueMicrotask(() => setPos(null)); return; }
    const compute = () => {
      if (window.innerWidth < 1024 || !triggerRef.current) { setPos(null); return; }
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [active, triggerRef]);

  return pos;
}

type LegalHeaderMenuProps = { role: "invite" | "citoyen" | "institution"; dashboardHref: string | null };

export function LegalHeaderMenu({ role, dashboardHref }: LegalHeaderMenuProps) {
  const { theme, mode, setMode } = useTheme();
  const C = T[theme];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const desktopPos = useDesktopAnchor(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Verrou de scroll uniquement en plein écran mobile — en dropdown
    // desktop, le reste de la page doit rester scrollable derrière (même
    // convention que HeaderPopover dans app/[slug]/[id]/layout.tsx, qui ne
    // verrouille jamais le scroll).
    if (!desktopPos) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, desktopPos]);

  // Fermeture au clic extérieur — uniquement en mode dropdown desktop (le
  // mode plein écran mobile n'a pas besoin de ça, le panneau couvre déjà
  // tout le viewport donc aucun clic ne peut atterrir "à côté").
  useEffect(() => {
    if (!open || !desktopPos) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, desktopPos]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "36px", height: "36px", borderRadius: "9px",
          border: "none", backgroundColor: "transparent",
          color: C.text, cursor: "pointer", flexShrink: 0,
        }}
      >
        {GEAR}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu du Centre légal"
          style={desktopPos ? {
            position: "fixed", top: desktopPos.top, right: desktopPos.right, zIndex: 200,
            width: "360px", maxHeight: "calc(100vh - 96px)",
            backgroundColor: C.cardBg, display: "flex", flexDirection: "column",
            overflowY: "auto", borderRadius: "14px", border: `1px solid ${C.borderCard}`,
            boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          } : {
            position: "fixed", inset: 0, zIndex: 200,
            backgroundColor: C.cardBg, display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            paddingTop: desktopPos ? "14px" : "calc(14px + env(safe-area-inset-top))",
            borderBottom: `1px solid ${C.borderCard}`, flexShrink: 0,
          }}>
            <span style={{ color: C.text, fontSize: "15px", fontWeight: 800 }}>Menu</span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Fermer le menu"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "34px", height: "34px", borderRadius: "50%",
                border: `1px solid ${C.borderCard}`, backgroundColor: "transparent",
                color: C.text, cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{ padding: "24px 16px calc(32px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: "32px", maxWidth: "480px", width: "100%", margin: "0 auto" }}>
            {/* CTA — en haut, comme demandé. Un citoyen ou une institution
                déjà connectés à Yelen ne doivent jamais voir d'invitation
                à se connecter (retour Bryan 30/09/2026) : remplacé par un
                accès direct à leur espace respectif. */}
            {role === "citoyen" ? (
              <div>
                <SectionLabel color={C.textFaint}>Compte</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <Link
                    href="/compte/parametres"
                    onClick={close}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px", width: "100%",
                      padding: "12px", borderRadius: "10px",
                      color: C.text, fontSize: "14px", fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    {ACCOUNT_ICON}
                    Paramètres du compte
                    {CHEVRON_RIGHT}
                  </Link>
                  <Link
                    href="/compte/confidentialite"
                    onClick={close}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px", width: "100%",
                      padding: "12px", borderRadius: "10px",
                      color: C.text, fontSize: "14px", fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    {SHIELD_ICON}
                    Confidentialité &amp; données
                    {CHEVRON_RIGHT}
                  </Link>
                </div>
              </div>
            ) : role === "institution" ? (
              <div>
                <SectionLabel color={C.textFaint}>Compte</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <Link
                    href={dashboardHref ?? "/"}
                    onClick={close}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px", width: "100%",
                      padding: "12px", borderRadius: "10px",
                      color: C.text, fontSize: "14px", fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    {DASHBOARD_ICON}
                    Tableau de bord
                    {CHEVRON_RIGHT}
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "10px" }}>
                <Link
                  href="/inscription"
                  onClick={close}
                  style={{
                    flex: 1, textAlign: "center", backgroundColor: "#F5A623", color: "#080812",
                    fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "12px", textDecoration: "none",
                  }}
                >
                  S&apos;inscrire
                </Link>
                <Link
                  href="/login"
                  onClick={close}
                  style={{
                    flex: 1, textAlign: "center", backgroundColor: "transparent", color: C.text,
                    fontWeight: 700, fontSize: "14px", padding: "13px", borderRadius: "12px", textDecoration: "none",
                    border: `1.5px solid ${C.borderCard}`,
                  }}
                >
                  Connexion
                </Link>
              </div>
            )}

            {/* Apparence — au milieu */}
            <div>
              <SectionLabel color={C.textFaint}>Apparence</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {THEME_OPTIONS.map(opt => {
                  const selected = mode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => setMode(opt.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px", width: "100%",
                        padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer",
                        backgroundColor: "transparent",
                        color: selected ? "#F5A623" : C.text, fontSize: "14px", fontWeight: selected ? 700 : 500,
                        textAlign: "left",
                      }}
                    >
                      {opt.icon(selected ? "#F5A623" : C.textSubtle)}
                      {opt.label}
                      {selected && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }} aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Langue — à la fin, comme demandé */}
            <div>
              <SectionLabel color={C.textFaint}>Langue</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {LANGUAGES.map(l => {
                  const selected = l.code === ACTIVE_LANG;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      disabled={l.comingSoon}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px", width: "100%",
                        padding: "12px", borderRadius: "10px", border: "none",
                        backgroundColor: "transparent",
                        color: l.comingSoon ? C.textFaint : (selected ? "#F5A623" : C.text),
                        fontSize: "14px", fontWeight: selected ? 700 : 500,
                        textAlign: "left", cursor: l.comingSoon ? "not-allowed" : "pointer",
                      }}
                    >
                      <span lang={l.code} dir={l.code === "ar" ? "rtl" : undefined}>{l.label}</span>
                      {l.comingSoon ? (
                        <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: C.textFaint, border: `1px solid ${C.borderCard}`, borderRadius: "999px", padding: "3px 8px" }}>
                          Bientôt
                        </span>
                      ) : selected ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }} aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ paddingTop: "16px", borderTop: `1px solid ${C.borderCard}`, color: C.textFaint, fontSize: "12px", lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>© {new Date().getFullYear()} Yelen224. Tous droits réservés.</p>
              <p style={{ margin: 0 }}>Dernière mise à jour des documents : {LEGAL_LAST_UPDATED}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
