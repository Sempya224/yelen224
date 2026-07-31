"use client";

// Onglet "Partenaires" — programme de partenariat Yelen (chantier
// 26/07/2026, décision CEO). Présente le programme, l'état de la demande
// de l'institution, et ouvre le formulaire plein écran de candidature
// (DemandePartenariatOverlay). Une fois approuvé (institutions.
// partenaire_statut='approuve'), l'onglet "Mes offres" se débloque
// ailleurs dans la nav (voir page.tsx).
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { DemandePartenariatOverlay } from "@/components/DemandePartenariatOverlay";

type PartenaireStatut = "aucun" | "en_attente" | "approuve" | "refuse";
type Demande = { id: string; statut: string; motif_refus: string | null; date_decision: string | null; created_at: string };

const ICONS = {
  Handshake: (color: string) => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/><path d="M6 16l2 2M18 16l-2 2"/></svg>,
  Check:    (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Link:     (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Chart:    (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>,
  Shield:   (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>,
};

const AVANTAGES = [
  { icon: "Link" as const,   titre: "Visibilité auprès des citoyens Yelen", texte: "Vos offres apparaissent sur l'écran Offres, consulté par les citoyens déjà inscrits sur la plateforme." },
  { icon: "Chart" as const,  titre: "Suivi de performance", texte: "Nombre de clics vers votre site pour chaque offre publiée, pour mesurer ce qui fonctionne." },
  { icon: "Shield" as const, titre: "Contrôle qualité Yelen", texte: "Chaque offre est vérifiée avant publication — un gage de confiance pour les citoyens qui la consultent." },
];

const ETAPES = [
  { n: 1, titre: "Vous soumettez votre candidature", texte: "Décrivez votre organisation, le type d'offres envisagées et l'impact attendu pour la communauté. Un site web officiel est requis." },
  { n: 2, titre: "Yelen examine votre demande", texte: "Notre équipe vérifie la conformité de votre organisation avec les règles de la plateforme." },
  { n: 3, titre: "Accès partenaire débloqué", texte: "Une fois approuvée, votre institution obtient l'onglet \"Mes offres\" pour créer et gérer vos offres." },
  { n: 4, titre: "Chaque offre est modérée avant publication", texte: "Vous rédigez le contenu, Yelen vérifie la conformité puis publie — vous gardez la main sur les visuels et le lien externe." },
];

export function PartenariatTab({ instId, access }: { instId: string; access: "full" | "read" }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [statut, setStatut] = useState<PartenaireStatut>("aucun");
  const [demande, setDemande] = useState<Demande | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/institution/partenariat?institution_id=${instId}`);
    const j = await res.json().catch(() => null);
    if (res.ok && j) {
      setStatut(j.partenaire_statut);
      setDemande(j.derniere_demande);
    }
    setLoading(false);
  }, [instId]);

  useEffect(() => { load(); }, [load]);

  const peutDemander = access === "full" && (statut === "aucun" || statut === "refuse");

  const STATUT_INFO: Record<PartenaireStatut, { label: string; color: string }> = {
    aucun:      { label: "Pas encore de demande", color: C.t2 },
    en_attente: { label: "Demande en cours d'examen", color: C.orange },
    approuve:   { label: "Partenaire Yelen actif", color: C.green },
    refuse:     { label: "Demande refusée", color: C.red },
  };
  const si = STATUT_INFO[statut];

  return (
    <div style={{ padding: "16px", maxWidth: "760px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: C.goldL, border: `1px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {ICONS.Handshake(C.gold)}
        </div>
        <div>
          <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: 900, margin: 0, letterSpacing: "-0.3px" }}>Programme de partenariat Yelen</h1>
          <p style={{ color: C.t2, fontSize: "13px", margin: "2px 0 0" }}>Mettez vos offres en avant auprès des citoyens Yelen.</p>
        </div>
      </div>

      {!loading && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Statut du partenariat</div>
            <div style={{ color: si.color, fontSize: "15px", fontWeight: 800 }}>{si.label}</div>
            {statut === "refuse" && demande?.motif_refus && (
              <div style={{ color: C.t2, fontSize: "12px", marginTop: "6px", maxWidth: "480px" }}>Motif : {demande.motif_refus}</div>
            )}
          </div>
          {peutDemander && (
            <button onClick={() => setFormOpen(true)} style={{ background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "12px 20px", borderRadius: "12px", cursor: "pointer" }}>
              Demander un partenariat
            </button>
          )}
        </div>
      )}

      <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Pourquoi rejoindre le programme ?</h2>
      <div style={{ display: "grid", gap: "10px", marginBottom: "24px" }}>
        {AVANTAGES.map(a => (
          <div key={a.titre} style={{ display: "flex", gap: "12px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {ICONS[a.icon](C.gold)}
            </div>
            <div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{a.titre}</div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{a.texte}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Comment ça marche</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0", marginBottom: "24px" }}>
        {ETAPES.map((e, i) => (
          <div key={e.n} style={{ display: "flex", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.bgCard2, border: `1.5px solid ${C.gold}`, color: C.gold, fontWeight: 900, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>{e.n}</div>
              {i < ETAPES.length - 1 && <div style={{ width: "1.5px", flex: 1, background: C.border, minHeight: "24px" }}/>}
            </div>
            <div style={{ paddingBottom: "18px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{e.titre}</div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "520px" }}>{e.texte}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Critères d&apos;éligibilité</h2>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px", marginBottom: "8px" }}>
        {["Institution déjà inscrite et active sur Yelen", "Site web officiel renseigné dans votre Profil Entreprise", "Offres conformes aux règles de la plateforme (aucun contenu de crédit ou microfinance dans ce programme)"].map(txt => (
          <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 0" }}>
            <span style={{ marginTop: "2px", flexShrink: 0 }}>{ICONS.Check(C.green)}</span>
            <span style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{txt}</span>
          </div>
        ))}
      </div>

      {formOpen && (
        <DemandePartenariatOverlay
          instId={instId}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}
