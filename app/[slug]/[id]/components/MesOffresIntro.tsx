"use client";

// Pop plein écran de valeur — "Mes offres" (chantier "Centre de pilotage
// des offres", 04/08/2026, retour Bryan : "c'est cette valeur qui fait que
// les institutions vont payer"). Affiché au premier accès à l'onglet
// (localStorage yelen224_offres_intro_vue, montré une seule fois),
// réouvrable à tout moment via l'icône info du titre. Chaque promesse
// listée ci-dessous correspond à une fonctionnalité réellement construite
// (jamais un argument marketing sans réalité derrière) : fil "Offres"
// citoyen réel, offre_vues/offre_clics réels, page publique + partage
// social réels, modération admin réelle.
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const VALEURS: { icon: React.ReactNode; titre: string; texte: string }[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
    ),
    titre: "Une vraie vitrine devant tous les citoyens Yelen",
    texte: "Chaque offre publiée apparaît dans le fil « Offres » vu par tous les citoyens inscrits sur Yelen, avec une chance d'être mise en avant parmi les offres les plus consultées.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
    ),
    titre: "Des chiffres réels, jamais des promesses",
    texte: "Vues, clics, taux de clic (CTR) — mis à jour en direct à partir de ce qui se passe réellement, jamais une estimation. Vous savez exactement ce que votre offre rapporte.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
    ),
    titre: "Une page professionnelle, prête à partager",
    texte: "Chaque offre publiée obtient sa propre page Yelen avec un aperçu automatique soigné — un clic suffit pour la partager sur WhatsApp, Facebook ou X.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    ),
    titre: "Vérifiée avant publication",
    texte: "Chaque offre est validée par l'équipe Yelen avant de devenir visible. La confiance des citoyens dans ce qu'ils voient sur Yelen protège aussi votre image.",
  },
];

export function MesOffresIntro({ onClose, onCreer }: { onClose: () => void; onCreer: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: C.bg, display: "flex", flexDirection: "column" }}>
      <header style={{ flexShrink: 0, background: `${C.bgCard}F5`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <span/>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>Mes offres</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "9px", background: C.bgCard2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t1, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "32px 20px 24px" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto 32px", textAlign: "center" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: `linear-gradient(135deg,${C.gold},${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#080812" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: C.t1, letterSpacing: "-0.3px", marginBottom: "10px" }}>Votre vitrine sur Yelen224</div>
          <div style={{ fontSize: "14px", color: C.t2, lineHeight: 1.65 }}>
            Publiez vos promotions, avantages et nouveautés directement devant les citoyens qui utilisent Yelen chaque jour — avec un vrai suivi de performance et un partage professionnel.
          </div>
        </div>

        <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          {VALEURS.map((v, i) => (
            <Card key={i} tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.gold }}>{v.icon}</div>
              <div>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "4px" }}>{v.titre}</div>
                <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.55 }}>{v.texte}</div>
              </div>
            </Card>
          ))}
        </div>
      </main>

      <footer style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.bgCard, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "560px", margin: "0 auto" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={onCreer}>Créer ma première offre</Button>
          <button onClick={onClose} className="tap" style={{ background: "none", border: "none", color: C.t2, fontWeight: 700, fontSize: "13px", padding: "8px", cursor: "pointer" }}>
            Voir mes offres
          </button>
        </div>
      </footer>
    </div>
  );
}
