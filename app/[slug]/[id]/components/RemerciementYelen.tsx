"use client";

// Section de bienvenue de l'écran Documents, affichée UNIQUEMENT quand le compte
// est validé (24/10/2026, frontend uniquement, contenu statique). Elle remercie
// l'établissement, indique trois étapes pour finir de s'installer et renvoie
// vers Yelen Community. Rien n'est promis que l'app ne fait pas : aucun délai,
// aucun avantage, aucune visibilité garantie. Le mot "communauté" est réservé
// au bouton, parce que l'établissement n'y est pas encore forcément approuvé
// (l'adhésion est modérée par l'équipe Yelen).
import type { ReactNode } from "react";
import type { ThemeTokens } from "../theme";
import { toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { YelenLogo } from "@/components/YelenLogo";
import { InstitutionBadgeVerifie } from "@/lib/institutionBadge";

type CibleOnglet = "disponibilites" | "services" | "codeqr" | "communaute-pro";

const ICON = (children: ReactNode, couleur: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const ETAPES: { cible: CibleOnglet; label: string; description: string; icone: (c: string) => ReactNode }[] = [
  { cible: "disponibilites", label: "Disponibilités", description: "Définissez vos jours et vos horaires de réservation.",
    icone: (c) => ICON(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></>, c) },
  { cible: "services", label: "Services", description: "Ajoutez les prestations que vous proposez.",
    icone: (c) => ICON(<><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="14" y2="13"/></>, c) },
  { cible: "codeqr", label: "Mon code QR", description: "Téléchargez ou imprimez votre code pour l'afficher à l'accueil.",
    icone: (c) => ICON(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M20 20v.01"/></>, c) },
];

export function RemerciementYelen({ C, nomEtablissement, badgeVerifie, onNavigate }: {
  C: ThemeTokens;
  nomEtablissement: string | null | undefined;
  badgeVerifie: boolean;
  onNavigate: (onglet: CibleOnglet) => void;
}) {
  const nom = nomEtablissement?.trim();
  return (
    <Card tokens={toCardTokens(C)} noPadding style={{ border: `1px solid ${C.border2}` }}>
      <style>{`
        .rm-row{transition:background-color 0.14s ease}
        .rm-row:hover{background-color:${C.bgCard2}}
        @media (max-width:1023px){.rm-btn{min-height:44px}}
        @media (prefers-reduced-motion:reduce){.rm-row{transition:none}}
      `}</style>

      <section aria-labelledby="rm-titre" style={{ padding: "20px 20px 16px" }}>
        <h2 id="rm-titre" style={{ color: C.t1, fontSize: 18, fontWeight: 600, letterSpacing: "-0.2px", margin: "0 0 10px" }}>Bienvenue chez Yelen</h2>
        <p style={{ color: C.t2, fontSize: 14, lineHeight: 1.6, margin: "0 0 10px" }}>
          Merci de nous faire confiance pour {nom ? <strong style={{ color: C.t1, fontWeight: 600 }}>{nom}</strong> : "votre établissement"}. Nous sommes heureux de vous compter parmi nous.
        </p>
        <p style={{ color: C.t2, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Les citoyens peuvent désormais vous trouver et réserver auprès de vous. Chaque personne que vous accueillez bien rend un peu plus simple ce qui l&apos;est rarement : faire une démarche.
        </p>
      </section>

      <section aria-labelledby="rm-etapes" style={{ borderTop: `1px solid ${C.border}` }}>
        <h3 id="rm-etapes" style={{ color: C.t1, fontSize: 13, fontWeight: 600, margin: 0, padding: "14px 20px 8px" }}>
          Quelques minutes pour finir de vous installer
        </h3>
        {ETAPES.map((e, i) => (
          <button key={e.cible} type="button" onClick={() => onNavigate(e.cible)}
            aria-label={`${e.label} — ${e.description}`}
            className="rm-row yelen-focus-ring"
            style={{ width: "100%", minHeight: 64, display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}>
            <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${C.gold}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{e.icone(C.gold)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", color: C.t1, fontSize: 14, fontWeight: 500 }}>{e.label}</span>
              <span style={{ display: "block", color: C.t2, fontSize: 13, marginTop: 1 }}>{e.description}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </section>

      <section style={{ borderTop: `1px solid ${C.border}`, padding: "16px 20px" }}>
        <Button tokens={toUiTokens(C)} variant="secondary" size="md" className="tap rm-btn"
          ariaLabel="Découvrir Yelen Community, l'espace de publication des établissements Yelen"
          onClick={() => onNavigate("communaute-pro")}>
          Découvrir Yelen Community
        </Button>
        <p style={{ color: C.t2, fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>L&apos;adhésion est examinée par l&apos;équipe Yelen.</p>
      </section>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <YelenLogo size={18} color={C.gold} strokeWidth={2.2}/>
          <span style={{ color: C.t2, fontSize: 13, fontWeight: 600 }}>L&apos;équipe Yelen</span>
        </div>
        {/* Seul "cadeau" réel : le badge Vérifié, s'il a déjà été accordé par
            l'équipe. Aucun geste de bienvenue n'existe en données (décision
            produit à prendre). */}
        {badgeVerifie && <InstitutionBadgeVerifie verifie couleurTexte={C.t2} taille={15}/>}
      </footer>
    </Card>
  );
}
