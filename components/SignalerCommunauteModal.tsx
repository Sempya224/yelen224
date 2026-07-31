"use client";

// Modale de signalement d'une publication ou d'un auteur "Yelen Community"
// (27/07/2026, retour Bryan). Réutilise la table `signalements` existante
// (cible_type/cible_id/type/auteur_id/description, déjà lue telle quelle
// par app/api/admin/signalements/route.ts et affichée dans
// app/admin/moderation/page.tsx — aucune nouvelle UI admin nécessaire).
// Écriture directe côté client (RLS déjà permissive sur cette table
// d'origine, même flux que app/signalement/page.tsx).
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";

const MOTIFS = [
  "Spam ou publicité",
  "Contenu inapproprié",
  "Harcèlement",
  "Arnaque ou fraude",
  "Autre",
];

export default function SignalerCommunauteModal({
  cible, citoyenId, isDark, card, t1, t2, brd, onClose, onEnvoye,
}: {
  cible: { type: "post" | "auteur"; id: string; label: string };
  citoyenId: string | null;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
  onClose: () => void;
  onEnvoye: () => void;
}) {
  const [motif, setMotif] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(false);

  async function envoyer() {
    if (!motif || !citoyenId) return;
    setEnvoi(true);
    setErreur(false);
    const { error } = await supabase.from("signalements").insert({
      type: cible.type === "post" ? "Publication Communauté" : "Auteur Communauté",
      description: note.trim() ? `${motif} — ${note.trim()}` : motif,
      statut: "en_cours",
      cible_type: cible.type === "post" ? "communaute_post" : "communaute_auteur",
      cible_id: cible.id,
      auteur_id: citoyenId,
    });
    setEnvoi(false);
    if (error) { setErreur(true); return; }
    onEnvoye();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <style>{`@keyframes signalerUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "480px", background: card, borderRadius: "24px 24px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", animation: "signalerUp 0.2s ease" }}
      >
        <div style={{ width: "40px", height: "4px", borderRadius: "4px", background: brd, margin: "0 auto 18px" }} />
        <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "4px" }}>
          {cible.type === "post" ? "Signaler cette publication" : `Signaler ${cible.label}`}
        </div>
        <div style={{ color: t2, fontSize: "12px", marginBottom: "16px" }}>Votre signalement est transmis à l&apos;équipe Yelen pour vérification.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
          {MOTIFS.map(m => (
            <button
              key={m}
              onClick={() => setMotif(m)}
              className="tap"
              style={{
                display: "flex", alignItems: "center", gap: "10px", textAlign: "left",
                background: motif === m ? "rgba(245,166,35,0.1)" : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                border: `1px solid ${motif === m ? "rgba(245,166,35,0.4)" : brd}`, borderRadius: "12px", padding: "11px 14px", cursor: "pointer",
              }}
            >
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${motif === m ? "#F5A623" : brd}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {motif === m && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F5A623" }} />}
              </div>
              <span style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{m}</span>
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Détail (optionnel)"
          style={{ width: "100%", minHeight: "60px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${brd}`, borderRadius: "12px", padding: "10px 12px", color: t1, fontSize: "12.5px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "14px", outline: "none" }}
        />

        {erreur && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "10px" }}>Impossible d&apos;envoyer le signalement. Réessayez.</div>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} className="tap" style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "12px", padding: "13px", color: t1, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Annuler</button>
          <button
            onClick={envoyer}
            disabled={!motif || envoi}
            className="tap"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#ef4444", border: "none", borderRadius: "12px", padding: "13px", color: "#fff", fontSize: "13px", fontWeight: 800, cursor: (!motif || envoi) ? "default" : "pointer", opacity: !motif ? 0.5 : 1 }}
          >
            {envoi ? <YelenLoader size={14} color="#fff" /> : "Signaler"}
          </button>
        </div>
      </div>
    </div>
  );
}
