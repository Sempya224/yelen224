"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Écran de blocage partagé — chantier Auth Security (28/08/2026).
// Refonte de copy/présentation (retour Bryan 28/08/2026, captures
// IMG_1807/1808) : le ton d'origine ("tentatives automatisées",
// "appareil suspect") lisait comme une accusation/un message d'erreur
// système. Reformulé en positionnement "Yelen vous protège" — jamais
// "vous avez fait quelque chose de mauvais" — niveau produit
// fintech/identity platform (carte blanche, hiérarchie forte, aucun
// rouge, compteur mm:ss réellement dynamique).
//
// 2e retour (IMG_1809) : tout centré lisait comme un écran d'erreur
// générique, pas "pro" — passé en alignement gauche (même logique que
// CompteSuspenduScreen.tsx). Sur desktop, bascule en layout horizontal
// icône/titre à gauche + contenu à droite, même pattern déjà établi par
// .signup-split (app/institution/inscription/engine) et
// .yelen-login-step-split (app/institution/connexion/page.tsx) plutôt
// qu'une carte mobile simplement agrandie.
//
// 3e retour (IMG_1810, côté citoyen) : malgré l'alignement gauche du
// texte, le composant restait visuellement "centré" — il s'imposait
// comme sa propre carte flottante (fond/bordure/ombre/coins arrondis +
// wrapper flex centré) À L'INTÉRIEUR du conteneur déjà centré/padded de
// chaque page (480px margin:auto côté citoyen, .yelen-login-card côté
// institution) — carte dans une carte. Retiré : ce composant rend
// maintenant du contenu simple, pleine largeur, qui hérite du fond de la
// page — la seule "carte" reste celle de la page appelante.
//
// Un seul composant réutilisé par les 5 flux (connexion/inscription
// citoyen + institution, récupération) — jamais 4 implémentations
// différentes. Couleurs indépendantes des tokens de thème de chaque page
// appelante (citoyen: T[theme], institution/connexion: objet C custom) —
// seul `dark` est reçu en prop, l'or de marque (#F5A623) reste fixe
// partout (CLAUDE.md : jamais toucher C.gold).
export function AuthSecurityBlockedScreen({
  state,
  retryAfterS = 0,
  dark = false,
  supportEmail = "support@yelen224.com",
  onExpire,
}: {
  state: "blocked" | "support_only";
  retryAfterS?: number;
  dark?: boolean;
  supportEmail?: string;
  /** Appelé une fois le décompte à zéro — laisse le parent réarmer le
   * formulaire (facilité d'UX uniquement : la porte réelle reste
   * revérifiée côté serveur à la prochaine tentative, voir
   * lib/security/authSecurity.ts). */
  onExpire?: () => void;
}) {
  const [restant, setRestant] = useState(retryAfterS);
  useEffect(() => setRestant(retryAfterS), [retryAfterS]);

  useEffect(() => {
    if (state !== "blocked" || restant <= 0) return;
    const t = setTimeout(() => setRestant((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [state, restant]);

  const aExpireRef = useRef(false);
  useEffect(() => { aExpireRef.current = false; }, [retryAfterS]);
  useEffect(() => {
    if (state === "blocked" && restant === 0 && !aExpireRef.current) {
      aExpireRef.current = true;
      onExpire?.();
    }
  }, [state, restant, onExpire]);

  const gold = "#F5A623";
  const surface = dark ? "rgba(255,255,255,0.03)" : "#F8F8FB";
  const border = dark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)";
  const t1 = dark ? "#F5F3EE" : "#0d0d1a";
  const t2 = dark ? "#A6A6B3" : "#5B5B63";
  const t3 = dark ? "#77778A" : "#8A8A92";

  function formatDecompte(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m > 0) return `${m} min ${String(sec).padStart(2, "0")} s`;
    return `${sec} s`;
  }

  return (
    <div className="auth-blocked-root" style={{ animation: "fadeUp 0.35s ease" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .auth-blocked-icon{margin:0 0 20px}
        @media (min-width: 900px){
          .auth-blocked-root{display:flex;flex-direction:row;align-items:flex-start;gap:52px}
          .auth-blocked-side{flex:0 0 260px}
          .auth-blocked-body{flex:1;min-width:0;margin-top:0!important}
        }
      `}</style>
      <div className="auth-blocked-side">
        <div className="auth-blocked-icon" style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${gold}16`, border: `1.5px solid ${gold}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12.5l2 2 4-4.5" />
          </svg>
        </div>

        <h1 style={{ color: t1, fontSize: "21px", fontWeight: 900, letterSpacing: "-0.4px", margin: 0, lineHeight: 1.25 }}>
          Votre accès est temporairement protégé
        </h1>
      </div>

      <div className="auth-blocked-body" style={{ marginTop: "22px" }}>
        <p style={{ color: t2, fontSize: "13.5px", lineHeight: 1.65, margin: "0 0 10px" }}>
            Nous avons temporairement limité les actions de connexion et d&apos;inscription depuis cet appareil après plusieurs tentatives rapprochées.
          </p>
          <p style={{ color: t2, fontSize: "13.5px", lineHeight: 1.65, margin: "0 0 24px" }}>
            Cette mesure permet de protéger les comptes Yelen et d&apos;empêcher les tentatives d&apos;accès non autorisées.
          </p>

          {state === "blocked" ? (
            <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: "16px", padding: "18px 20px", marginBottom: "18px" }}>
              <div style={{ color: t3, fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px" }}>
                Vous pourrez réessayer dans
              </div>
              <div style={{ color: t1, fontSize: "25px", fontWeight: 900, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>
                {formatDecompte(restant)}
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "18px" }}>
              <div style={{ color: t1, fontSize: "13px", fontWeight: 700, lineHeight: 1.5 }}>
                Une vérification par notre équipe est nécessaire pour rétablir l&apos;accès sur cet appareil.
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "26px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
            <span style={{ color: t1, fontSize: "12.5px", fontWeight: 700 }}>Votre compte et vos informations restent protégés</span>
          </div>

          {/* "Pourquoi cette protection ?" — jamais de vocabulaire
              accusateur ("robot", "fraudeur", "utilisateur mal
              intentionné"). */}
          <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: "14px", padding: "16px 18px", marginBottom: "26px" }}>
            <div style={{ color: t1, fontSize: "12.5px", fontWeight: 800, marginBottom: "6px" }}>Pourquoi cette protection ?</div>
            <p style={{ color: t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
              Yelen applique automatiquement des mesures de sécurité lorsque le nombre de tentatives devient inhabituel. Cela permet de protéger les utilisateurs contre les accès non autorisés et les tentatives automatisées.
            </p>
          </div>

          <a
            href={`mailto:${supportEmail}`}
            className="tap"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", padding: "15px", background: gold, color: "#080812", fontWeight: 800, fontSize: "14.5px", borderRadius: "14px", textDecoration: "none", marginBottom: "14px" }}
          >
            Contacter le support
          </a>

        <Link href="/" style={{ color: t2, fontWeight: 600, fontSize: "12.5px", textDecoration: "none" }}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
