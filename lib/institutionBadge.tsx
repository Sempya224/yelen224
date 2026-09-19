// Badge "Vérifié par Yelen" institution — source unique partagée entre la
// fiche publique (InstitutionPublicClient.tsx), les posts institution dans
// Yelen Community (CommunautePostCard.tsx) et la carte de profil
// (ProfilInstitutionCommunauteOverlay.tsx). 22/08/2026, retour Bryan :
// jamais le badge/texte "Vérifié" citoyen (BadgeVerifie de
// CommunautePostCard.tsx) — logique distincte, voir ci-dessous.
//
// `institutions.badge_verifie` est un badge premium accordé par l'admin
// (app/api/admin/institutions/[id]/badge), séparé du fait que toute
// institution publique a déjà `statut='validee'` (RLS
// institutions_public_read). Donc : badge_verifie=true → icône réelle (le
// même sceau bleu que la fiche publique) + "Vérifié par Yelen".
// badge_verifie=false → même texte "Vérifié par Yelen" mais sans icône
// (vrai pour toutes les institutions visibles, aucune donnée inventée).
export function MetaVerifiedBadge({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#0095F6" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" />
      <path fill="#fff" d="M9.9 16.2 6 12.3l1.4-1.4 2.5 2.5 6.7-6.7 1.4 1.4z" />
    </svg>
  );
}

// Pastille "Vérifié" — même design que l'ancien badge citoyen de
// CommunautePostCard.tsx (23/08/2026, retour Bryan : "met le badge bleu du
// profil citoyen sur les profils institution qui n'ont pas le badge bleu
// meta"). Recopiée ici plutôt qu'importée pour éviter un import circulaire
// (CommunautePostCard.tsx importe déjà InstitutionBadgeVerifie depuis ce
// fichier) — même tolérance que la copie locale de MetaVerifiedBadge dans
// InstitutionPublicClient.tsx.
function PastilleVerifie() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(37,99,235,0.12)", color: "#2563EB", fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3"><path d="M12 2 20 6v6c0 5.4-3.4 8.8-8 10-4.6-1.2-8-4.6-8-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
      Vérifié
    </span>
  );
}

export function InstitutionBadgeVerifie({ verifie, couleurTexte, taille = 13 }: { verifie: boolean; couleurTexte: string; taille?: number }) {
  // badge_verifie=true (premium, accordé par l'admin) → sceau Meta réel +
  // texte, inchangé. badge_verifie=false → pastille "Vérifié" (au lieu du
  // texte seul d'avant) : toute institution publique est déjà validée par
  // Yelen, la pastille le signale visuellement même sans le sceau premium.
  if (verifie) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <MetaVerifiedBadge size={taille} />
        <span style={{ color: couleurTexte, fontSize: `${taille - 3}px`, fontWeight: 700 }}>Vérifié par Yelen</span>
      </span>
    );
  }
  return <PastilleVerifie />;
}
