"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// "Suivis" — chantier refonte "Mes démarches" du 26/07/2026 (décision CEO :
// écran majeur d'engagement, séparé des "Démarches" — une démarche est
// créée à la main par le citoyen, un suivi est une lecture de son
// activité réelle proposée par Yelen). Zéro invention : chaque carte
// correspond à un fait vérifiable (RDV réel, dépense réelle, démarche
// réelle en retard...), voir app/api/citoyen/suivis/route.ts. Un suivi
// peut mener vers un autre écran, ou proposer de créer une démarche —
// dans ce cas on réutilise exactement le formulaire de création existant
// (titre pré-rempli, jamais un modèle avec étapes imposées).
export type Suivi = {
  id: string;
  type: "rdv" | "avis" | "documents" | "demarche_retard" | "demarche_echeance" | "depense" | "interet";
  titre: string;
  description: string;
  action: { kind: "lien"; href: string } | { kind: "creer_demarche"; titre: string; categorie: "personnel" | "professionnel" };
};

const Illu: Record<Suivi["type"], () => React.ReactNode> = {
  rdv: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEF3C7"/><rect x="14" y="14" width="24" height="22" rx="3" fill="#F5A623"/><rect x="19" y="10" width="3" height="7" rx="1.5" fill="#F5A623"/><rect x="30" y="10" width="3" height="7" rx="1.5" fill="#F5A623"/><rect x="18" y="24" width="5" height="5" fill="#fff"/><rect x="29" y="24" width="5" height="5" fill="#fff"/></svg>),
  avis: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEF3C7"/><polygon points="26,12 30.5,21.5 41,23 33.5,30 35.5,40.5 26,35.5 16.5,40.5 18.5,30 11,23 21.5,21.5" fill="#F5A623"/></svg>),
  documents: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#DBEAFE"/><path d="M17 12h13l7 7v21H17z" fill="#2563EB"/><path d="M30 12v7h7" fill="#93C5FD"/><rect x="21" y="26" width="10" height="2.4" rx="1.2" fill="#DBEAFE"/><rect x="21" y="31" width="10" height="2.4" rx="1.2" fill="#DBEAFE"/></svg>),
  demarche_retard: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEE2E2"/><circle cx="26" cy="26" r="14" fill="none" stroke="#E11D48" strokeWidth="3"/><line x1="26" y1="26" x2="26" y2="18" stroke="#E11D48" strokeWidth="3" strokeLinecap="round"/><line x1="26" y1="26" x2="32" y2="30" stroke="#E11D48" strokeWidth="3" strokeLinecap="round"/></svg>),
  demarche_echeance: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FFEDD5"/><path d="M18 14h16v6c0 4-3 5-3 6s3 2 3 6v6H18v-6c0-4 3-5 3-6s-3-2-3-6z" fill="#EA580C"/></svg>),
  depense: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#EDE9FE"/><rect x="14" y="30" width="7" height="10" rx="1.5" fill="#C4B5FD"/><rect x="23" y="24" width="7" height="16" rx="1.5" fill="#A78BFA"/><rect x="32" y="16" width="7" height="24" rx="1.5" fill="#7C3AED"/></svg>),
  interet: () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#CFFAFE"/><circle cx="26" cy="26" r="13" fill="none" stroke="#0891B2" strokeWidth="3"/><circle cx="26" cy="26" r="7" fill="none" stroke="#0891B2" strokeWidth="3"/><circle cx="26" cy="26" r="2.4" fill="#0891B2"/></svg>),
};

export function SuivisSection({ isDark, onCreerDemarche }: { isDark: boolean; onCreerDemarche: (titre: string, categorie: "personnel" | "professionnel") => void }) {
  const router = useRouter();
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombre = isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)";

  const [loading, setLoading] = useState(true);
  const [suivis, setSuivis] = useState<Suivi[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      try {
        const res = await fetch("/api/citoyen/suivis", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (body.success) setSuivis(body.suivis ?? []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  function agir(s: Suivi) {
    if (s.action.kind === "creer_demarche") { onCreerDemarche(s.action.titre, s.action.categorie); return; }
    if (s.action.href.startsWith("#")) { document.getElementById(s.action.href.slice(1))?.scrollIntoView({ behavior: "smooth" }); return; }
    router.push(s.action.href);
  }

  if (loading) {
    return (
      <div style={{ marginBottom: "24px" }}>
        <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>Votre activité</div>
        <div style={{ backgroundColor: card, borderRadius: "18px", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{ position: "relative", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ position: "absolute", width: "40px", height: "40px", borderRadius: "50%", border: "2px solid #F5A623", animation: "radarPing 1.8s ease-out infinite" }}/>
            <span style={{ position: "absolute", width: "40px", height: "40px", borderRadius: "50%", border: "2px solid #F5A623", animation: "radarPing 1.8s ease-out 0.6s infinite" }}/>
            <span style={{ position: "absolute", width: "40px", height: "40px", borderRadius: "50%", border: "2px solid #F5A623", animation: "radarPing 1.8s ease-out 1.2s infinite" }}/>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#F5A623" }}/>
          </div>
          <div style={{ color: t2, fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center" }}>
            Analyse de votre activité
            <span style={{ display: "inline-flex", marginLeft: "2px" }}>
              <span style={{ animation: "dotFade 1.4s ease-in-out infinite" }}>.</span>
              <span style={{ animation: "dotFade 1.4s ease-in-out 0.2s infinite" }}>.</span>
              <span style={{ animation: "dotFade 1.4s ease-in-out 0.4s infinite" }}>.</span>
            </span>
          </div>
        </div>
        <style>{`
          @keyframes radarPing{0%{transform:scale(0.4);opacity:0.9}100%{transform:scale(1.8);opacity:0}}
          @keyframes dotFade{0%,80%,100%{opacity:0.2}40%{opacity:1}}
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>Votre activité</div>

      {suivis.length === 0 ? (
        <div style={{ backgroundColor: card, borderRadius: "18px", padding: "20px", textAlign: "center", boxShadow: ombre }}>
          <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700", marginBottom: "4px" }}>Rien à signaler pour l'instant.</div>
          <div style={{ color: t2, fontSize: "12px" }}>Dès qu'il y aura quelque chose d'utile à vous dire, ça apparaîtra ici.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {suivis.map((s, i) => (
            <button key={s.id} onClick={() => agir(s)} className="tap" style={{ display: "flex", alignItems: "center", gap: "14px", textAlign: "left", padding: "14px", borderRadius: "18px", border: "none", backgroundColor: card, boxShadow: ombre, cursor: "pointer", animation: `suiviIn 0.3s ease ${i * 0.06}s both` }}>
              <div style={{ flexShrink: 0 }}>{Illu[s.type]()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "2px" }}>{s.titre}</div>
                <div style={{ color: t2, fontSize: "12px", lineHeight: "1.4" }}>{s.description}</div>
              </div>
              <div style={{ flexShrink: 0, width: "30px", height: "30px", borderRadius: "50%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </button>
          ))}
        </div>
      )}
      <style>{`@keyframes suiviIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
