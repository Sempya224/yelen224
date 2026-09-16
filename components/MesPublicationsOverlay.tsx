"use client";

// Statut de mes publications "Yelen Community" (27/07/2026, retour
// Bryan) — plein écran, même convention header que les autres popups
// (X, titre centré). Liste tous les statuts réels (posts_own_read),
// jamais une donnée inventée.
import Image from "next/image";
import { formatDateFr } from "@/components/CommunautePostCard";

type MaPublication = { id: string; statut: string; contenu: string | null; created_at: string; motif_refus: string | null };

const STATUT_INFO: Record<string, { label: string; couleur: string }> = {
  en_attente_validation: { label: "En attente de validation", couleur: "#F5A623" },
  publiee: { label: "Publiée", couleur: "#16A34A" },
  refusee: { label: "Refusée", couleur: "#DC2626" },
};

export default function MesPublicationsOverlay({
  publications, bg, card, card2, t1, t2, t3, brd, onClose,
  identiteVerifiee, onCreerPost, onVerifierIdentite,
}: {
  publications: MaPublication[];
  bg: string; card: string; card2: string; t1: string; t2: string; t3: string; brd: string;
  onClose: () => void;
  // État vide (retour Bryan 09/09/2026) — identité vérifiée : CTA direct
  // vers le composeur ; sinon CTA vers la vérification d'identité (même
  // exigence que le composeur du fil, voir CommunauteVerificationSheet
  // dans app/page.tsx). Jamais les deux en même temps.
  identiteVerifiee: boolean;
  onCreerPost: () => void;
  onVerifierIdentite: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span />
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Mes publications</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>
        {publications.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 10px 40px" }}>
            <Image src="/illustrations/mes-publications-vide.png" alt="Vous n'avez encore rien publié" width={1536} height={1024} style={{ width: "220px", maxWidth: "100%", height: "auto", margin: "0 auto 20px", display: "block" }}/>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>Vous n&apos;avez encore rien publié</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.55, marginBottom: "24px" }}>
              {identiteVerifiee
                ? "Partagez votre première idée avec la communauté Yelen — ça ne prend qu'une minute."
                : "Vérifiez votre identité pour publier vos propres idées sur Yelen — ça protège la communauté des faux comptes."}
            </div>
            <button onClick={identiteVerifiee ? onCreerPost : onVerifierIdentite} className="tap" style={{ background: "#F5A623", color: "#080812", border: "none", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              {identiteVerifiee ? "Créer ma première publication" : "Vérifier mon identité"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {publications.map(p => {
              const info = STATUT_INFO[p.statut] ?? { label: p.statut, couleur: t3 };
              return (
                <div key={p.id} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ background: `${info.couleur}18`, color: info.couleur, fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>{info.label}</span>
                    <span style={{ color: t3, fontSize: "11px" }}>{formatDateFr(p.created_at)}</span>
                  </div>
                  {p.contenu && <div style={{ color: t1, fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.contenu}</div>}
                  {p.statut === "refusee" && p.motif_refus && (
                    <div style={{ color: "#DC2626", fontSize: "12px", marginTop: "8px" }}>Motif : {p.motif_refus}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
