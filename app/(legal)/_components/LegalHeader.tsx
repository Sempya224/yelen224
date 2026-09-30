"use client";

// Header du Centre légal Yelen (chantier Legal Yelen — architecture
// globale de navigation, 23/09/2026 ; épuré le même jour sur retour
// Bryan). Expérience Guest/Authenticated ajoutée le 30/09/2026 (retour
// Bryan, brief détaillé référence Apple HIG "indiquer l'état de connexion
// actuel") : un visiteur garde l'écran indépendant d'origine (logo +
// "Centre légal", CTA Connexion/Inscription dans le menu) ; un citoyen ou
// une institution déjà connectés à Yelen voient un bouton "Retour à
// Yelen" à la place du logo et un avatar de compte à la place des CTA.
// Étendu côté institution le même jour (retour Bryan "pareil pour côté
// institution") : session JWT custom (cookie httpOnly), donc invisible en
// localStorage contrairement au citoyen — détectée via
// GET /api/institution/auth/me (ok uniquement si la session est valide).
// Les deux rôles sont mutuellement exclusifs en pratique (flux de
// connexion distincts), le citoyen est vérifié en premier (lecture
// localStorage synchrone, gratuite) avant d'interroger la route
// institution (réseau, uniquement si aucun citoyen détecté).
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { LegalHeaderMenu } from "./LegalHeaderMenu";
import { LegalLanguageSwitcher } from "./LegalLanguageSwitcher";
import { useLegalMobileNav } from "./LegalMobileNavContext";

const PERSON_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
  </svg>
);

const CHEVRON_LEFT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const DOCUMENTS_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

export function LegalHeader() {
  const { theme } = useTheme();
  const C = T[theme];
  const router = useRouter();
  const { ouvert, setOuvert } = useLegalMobileNav();
  // Même arbitrage que LegalSidebar.tsx::connecte — lu après montage
  // uniquement (pas de localStorage côté serveur, éviter un mismatch
  // d'hydratation).
  const [role, setRole] = useState<"invite" | "citoyen" | "institution">("invite");
  const [nomCompte, setNomCompte] = useState<string | null>(null);
  // Institution uniquement — /[slug]/[id] du dashboard, pour "Retour à
  // Yelen" (repli sans historique) et l'avatar. Les tabs du dashboard ne
  // sont plus adressables par URL (état React interne depuis le retrait
  // de la convention `?tab=`, voir layout.tsx) — un seul lien possible,
  // vers la racine du dashboard.
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);
  const connecte = role !== "invite";

  useEffect(() => {
    (async () => {
      let userId: string | null = null;
      try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
      if (userId) {
        setRole("citoyen");
        // Nom affiché (retour Bryan 30/09/2026) — même formule M./Mme +
        // nom que app/page.tsx::nomAffiche (repli sur le prénom seul si
        // le genre n'est pas renseigné), jamais un second format pour le
        // même citoyen ailleurs dans le produit.
        const { data } = await supabase.from("users").select("prenom,nom,sexe").eq("id", userId).maybeSingle();
        if (data) {
          const prenom = (data.prenom || "").trim();
          const nom = (data.nom || "").trim();
          const titreCivil = data.sexe === "homme" ? "M." : data.sexe === "femme" ? "Mme" : null;
          setNomCompte((titreCivil && nom ? `${titreCivil} ${nom}` : prenom) || null);
        }
        return;
      }
      // Pas de session citoyen — session institution éventuelle (JWT
      // httpOnly, invisible en localStorage, d'où cet appel réseau
      // contrairement au chemin citoyen ci-dessus). Silencieux si absente
      // (401 attendu pour un vrai visiteur, pas une erreur à logger).
      try {
        const res = await fetch("/api/institution/auth/me");
        if (!res.ok) return;
        const json = await res.json();
        setRole("institution");
        setNomCompte(json.name || null);
        if (json.slug && json.institutionId) setDashboardHref(`/${json.slug}/${json.institutionId}`);
      } catch {}
    })();
  }, []);

  // "Retour à Yelen" doit ramener au contexte d'origine (retour Bryan :
  // navigation hiérarchique, pas un simple lien fixe vers l'accueil) —
  // historique du navigateur plutôt qu'un paramètre `?from=` à propager
  // dans tous les liens existants vers /legal. Repli uniquement si le
  // Centre légal a été ouvert sans historique (lien externe, partage,
  // nouvel onglet) : accueil citoyen, ou dashboard institution si connu.
  function retourYelen() {
    if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
    router.push(role === "institution" && dashboardHref ? dashboardHref : "/");
  }

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      backgroundColor: theme === "dark" ? "rgba(13,13,26,0.96)" : "rgba(255,255,255,0.96)",
      backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${C.borderCard}`,
      paddingTop: "env(safe-area-inset-top)",
    }}>
      {/* Sous ~560px, "YELEN224" + séparateur ne tenaient pas sur une
          ligne à côté du reste et cassaient le header en 2-3 lignes
          (retour Bryan 23/09/2026). Le logo seul + "Centre légal" suffit
          à identifier la page. */}
      <style>{`
        .legal-header-brand-text { display: inline-flex; }
        @media (max-width: 560px) {
          .legal-header-brand-text { display: none; }
        }
        /* Icône "Documents" — uniquement quand la sidebar bascule en
           panneau mobile (même seuil que .legal-sidebar-mobile dans
           layout.tsx). Sur desktop la colonne de navigation permanente
           couvre déjà ce rôle. */
        .legal-header-docs-btn { display: none; }
        @media (max-width: 899px) {
          .legal-header-docs-btn { display: flex; }
        }
        /* Bouton "Retour à Yelen" (citoyen connecté) — compact sous
           ~440px (retour Bryan : "pas un bouton géant"), ne garde que le
           chevron. */
        .legal-header-back-text { display: inline; }
        @media (max-width: 440px) {
          .legal-header-back-text { display: none; }
        }
      `}</style>
      <div style={{ maxWidth: "1280px", margin: "0 auto", minHeight: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 16px" }}>
        {connecte ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <button
              type="button"
              onClick={retourYelen}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "7px 10px 7px 8px", borderRadius: "9px",
                border: `1px solid ${C.borderCard}`, backgroundColor: "transparent",
                color: C.text, fontSize: "13px", fontWeight: "700", cursor: "pointer",
                flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              {CHEVRON_LEFT}
              <span className="legal-header-back-text">Retour à Yelen</span>
            </button>
            <span style={{ width: "1px", height: "18px", backgroundColor: C.borderCard, flexShrink: 0 }}/>
            {/* Nom du compte à la place du label "Centre légal" (retour
                Bryan 30/09/2026 : le label statique doit disparaître
                entièrement une fois authentifié, plus de doublon
                eyebrow/valeur) — rien affiché tant que le nom n'a pas fini
                de charger, plutôt qu'un "Centre légal" transitoire. Reste
                un lien vers /legal : même affordance qu'avant. */}
            {nomCompte && (
              <Link href="/legal" style={{ color: C.text, fontSize: "14px", fontWeight: "800", letterSpacing: "-0.1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none", minWidth: 0 }}>
                {nomCompte}
              </Link>
            )}
          </div>
        ) : (
          <Link href="/legal" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", minWidth: 0 }}>
            <div style={{ position: "relative", width: "34px", height: "34px", flexShrink: 0 }}>
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "9px", transform: "rotate(6deg)", opacity: 0.3 }} />
              <div style={{ position: "relative", width: "34px", height: "34px", backgroundColor: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
                </svg>
              </div>
            </div>
            <div className="legal-header-brand-text" style={{ alignItems: "center", gap: "10px", whiteSpace: "nowrap" }}>
              <span style={{ color: C.text, fontSize: "15px", fontWeight: "800", letterSpacing: "0.5px" }}>YELEN224</span>
              <span style={{ width: "1px", height: "18px", backgroundColor: C.borderCard }}/>
            </div>
            <span style={{ color: C.textSubtle, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" }}>Centre légal</span>
          </Link>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            type="button"
            className="legal-header-docs-btn"
            onClick={() => setOuvert(v => !v)}
            aria-label="Changer de document"
            aria-expanded={ouvert}
            style={{
              alignItems: "center", justifyContent: "center",
              width: "36px", height: "36px", borderRadius: "9px",
              border: "none", backgroundColor: "transparent",
              color: C.text, cursor: "pointer", flexShrink: 0,
            }}
          >
            {DOCUMENTS_ICON}
          </button>
          {connecte && (
            <Link
              href={role === "institution" ? (dashboardHref ?? "/") : "/compte/parametres"}
              aria-label={role === "institution" ? "Mon tableau de bord Yelen" : "Mon compte Yelen"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "32px", height: "32px", borderRadius: "50%",
                backgroundColor: "#F5A623", flexShrink: 0,
              }}
            >
              {PERSON_ICON}
            </Link>
          )}
          <LegalLanguageSwitcher variant="pill" />
          <LegalHeaderMenu role={role} dashboardHref={dashboardHref} />
        </div>
      </div>
    </header>
  );
}
