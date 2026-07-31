"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SECTIONS_INTERET, type CentreInteretId } from "@/lib/centresInteret";
import { updateCentresInteret } from "./actions";

// "Vos centres d'intérêt" — chantier engagement du 25/07/2026. Décision
// CEO : chaque citoyen doit avoir sa propre expérience Yelen selon ce qui
// l'intéresse réellement — cet écran capture la préférence, une future
// brique (recommandations Accueil) s'en servira. Les ids réutilisent la
// taxonomie déjà réelle du produit (secteurs d'institutions + catégories
// Leçons d'argent), pas une liste inventée — voir lib/centresInteret.ts.
// Illustrations sur mesure, une par centre d'intérêt (pas d'icône
// générique répétée).
const Illu: Record<CentreInteretId, () => React.ReactNode> = {
  "santé": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEE2E2"/><rect x="22" y="14" width="8" height="24" rx="2" fill="#E11D48"/><rect x="14" y="22" width="24" height="8" rx="2" fill="#E11D48"/></svg>),
  "administratif": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#DBEAFE"/><rect x="15" y="13" width="22" height="27" rx="2" fill="#2563EB"/><rect x="19" y="18" width="14" height="3" rx="1.5" fill="#DBEAFE"/><rect x="19" y="24" width="14" height="3" rx="1.5" fill="#DBEAFE"/><rect x="19" y="30" width="9" height="3" rx="1.5" fill="#DBEAFE"/></svg>),
  "financier": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#CFFAFE"/><rect x="13" y="24" width="26" height="14" rx="2" fill="#0891B2"/><path d="M26 12l14 8H12z" fill="#0891B2"/><rect x="17" y="27" width="4" height="8" fill="#CFFAFE"/><rect x="24" y="27" width="4" height="8" fill="#CFFAFE"/><rect x="31" y="27" width="4" height="8" fill="#CFFAFE"/></svg>),
  "juridique": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#EDE9FE"/><line x1="26" y1="12" x2="26" y2="38" stroke="#6D28D9" strokeWidth="3" strokeLinecap="round"/><line x1="14" y1="18" x2="38" y2="18" stroke="#6D28D9" strokeWidth="3" strokeLinecap="round"/><path d="M14 18l-5 10a5 5 0 0 0 10 0z" fill="#6D28D9"/><path d="M38 18l-5 10a5 5 0 0 0 10 0z" fill="#6D28D9"/><rect x="20" y="36" width="12" height="3" rx="1.5" fill="#6D28D9"/></svg>),
  "beauté_bien_etre": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FCE7F3"/><path d="M26 14c1.5 5 4.5 8 9.5 9.5-5 1.5-8 4.5-9.5 9.5-1.5-5-4.5-8-9.5-9.5 5-1.5 8-4.5 9.5-9.5z" fill="#DB2777"/></svg>),
  "commerce": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FFEDD5"/><rect x="15" y="21" width="22" height="17" rx="2" fill="#EA580C"/><path d="M19 21v-3a7 7 0 0 1 14 0v3" stroke="#EA580C" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>),
  "artisanat": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEF3C7"/><rect x="21" y="14" width="10" height="8" rx="2" fill="#92400E" transform="rotate(45 26 18)"/><rect x="17" y="24" width="6" height="16" rx="2" fill="#B45309" transform="rotate(45 20 32)"/></svg>),
  "services_divers": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#E2E8F0"/><circle cx="19" cy="19" r="4" fill="#475569"/><circle cx="33" cy="19" r="4" fill="#475569"/><circle cx="19" cy="33" r="4" fill="#475569"/><circle cx="33" cy="33" r="4" fill="#475569"/></svg>),
  "epargne": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#DCFCE7"/><circle cx="26" cy="26" r="10" fill="#16A34A"/><circle cx="19" cy="20" r="5" fill="#22C55E"/><circle cx="33" cy="20" r="5" fill="#22C55E"/></svg>),
  "mobile_money": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#E0E7FF"/><rect x="17" y="12" width="18" height="28" rx="4" fill="#4F46E5"/><rect x="21" y="18" width="10" height="14" rx="2" fill="#C7D2FE"/></svg>),
  "credit": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FEF3C7"/><rect x="15" y="27" width="7" height="12" rx="1.5" fill="#E8960A"/><rect x="24" y="20" width="7" height="19" rx="1.5" fill="#F5A623"/><rect x="33" y="14" width="7" height="25" rx="1.5" fill="#C8740A"/></svg>),
  "revenus": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#D1FAE5"/><path d="M26 36V20" stroke="#0F766E" strokeWidth="4" strokeLinecap="round"/><path d="M26 20c-8 0-12-6-12-6s4 9 12 9 12-9 12-9-4 6-12 6z" fill="#0F766E"/></svg>),
  "budget": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#EDE9FE"/><rect x="16" y="13" width="20" height="26" rx="3" fill="#7C3AED"/><line x1="20" y1="20" x2="32" y2="20" stroke="#EDE9FE" strokeWidth="2.6" strokeLinecap="round"/><line x1="20" y1="26" x2="29" y2="26" stroke="#EDE9FE" strokeWidth="2.6" strokeLinecap="round"/><line x1="20" y1="32" x2="31" y2="32" stroke="#EDE9FE" strokeWidth="2.6" strokeLinecap="round"/></svg>),
  "fraudes": () => (<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="26" fill="#FFE4E6"/><path d="M26 12l14 6v10c0 10-6 15-14 17-8-2-14-7-14-17V18z" fill="#E11D48"/><line x1="26" y1="21" x2="26" y2="31" stroke="#fff" strokeWidth="3.4" strokeLinecap="round"/><circle cx="26" cy="35" r="2" fill="#fff"/></svg>),
};

export function InteretsClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";

  const [userId, setUserId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<CentreInteretId>>(new Set());
  // Dernière sélection réellement enregistrée en base — comparée à
  // `selection` pour savoir si le bouton doit s'allumer (retour CEO
  // 25/07/2026 : inactif tant que rien de nouveau n'a été choisi/retiré,
  // que ce soit au 1er passage ou en revenant sur l'écran).
  const [enregistre, setEnregistre] = useState<Set<CentreInteretId>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dejaEnregistre, setDejaEnregistre] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmQuitOpen, setConfirmQuitOpen] = useState(false);

  const charger = useCallback(async (id: string) => {
    const { data } = await supabase.from("users").select("centres_interet").eq("id", id).maybeSingle();
    const valeurs = (data?.centres_interet ?? []) as CentreInteretId[];
    setSelection(new Set(valeurs));
    setEnregistre(new Set(valeurs));
    setDejaEnregistre(valeurs.length > 0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await charger(id); setLoading(false); })();
  }, [router, charger]);

  function toggle(id: CentreInteretId) {
    setSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const estDifferent = selection.size !== enregistre.size || Array.from(selection).some(id => !enregistre.has(id));

  async function enregistrer(apresEnregistrement?: () => void) {
    if (!userId) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setToast("Session expirée, reconnectez-vous.");
      setSaving(false);
      return;
    }
    const result = await updateCentresInteret(userId, session.access_token, Array.from(selection));
    setSaving(false);
    if (result.ok) {
      setDejaEnregistre(true);
      setEnregistre(new Set(selection));
      apresEnregistrement?.();
    }
    setToast(result.ok ? "Centres d'intérêt enregistrés." : (result.error || "Échec de l'enregistrement."));
    setTimeout(() => setToast(null), 2500);
  }

  function tenterQuitter() {
    if (estDifferent) { setConfirmQuitOpen(true); return; }
    router.push("/?menu=1");
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        @keyframes chipIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <CompteHeader titre="Vos centres d'intérêt" fondNeutre onBackIntercept={tenterQuitter}/>

      <div style={{ padding: "20px 20px 8px" }}>
        <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "6px" }}>Qu'est-ce qui compte pour vous ?</div>
        <div style={{ color: t2, fontSize: "13px", lineHeight: "1.5" }}>Vous pouvez en choisir plusieurs, revenir modifier quand vous voulez, et ça ne touche jamais à vos rendez-vous en cours.</div>
      </div>

      {loading ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: t3, fontSize: "14px", fontWeight: "600" }}>Chargement…</div>
      ) : (
        <div style={{ padding: "8px 20px 120px", flex: 1 }}>
          {SECTIONS_INTERET.map(section => (
            <div key={section.titre} style={{ marginTop: "18px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>{section.titre}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {section.items.map((item, i) => {
                  const actif = selection.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className="tap"
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px 8px 8px", borderRadius: "30px", border: "none", backgroundColor: actif ? "#080812" : card, cursor: "pointer", animation: `chipIn 0.3s ease ${i * 0.03}s both`, transition: "background-color 0.2s ease" }}
                    >
                      <span style={{ flexShrink: 0, display: "flex" }}>{Illu[item.id]()}</span>
                      <span style={{ color: actif ? "#fff" : t1, fontSize: "13.5px", fontWeight: "800", whiteSpace: "nowrap" }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px calc(env(safe-area-inset-bottom) + 16px)", background: `linear-gradient(180deg, transparent, ${bg} 30%)` }}>
        <button onClick={() => enregistrer()} disabled={saving || loading || !estDifferent} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "26px", border: "none", backgroundColor: (!estDifferent && !saving) ? card : "#F5A623", color: (!estDifferent && !saving) ? t3 : "#080812", fontSize: "15px", fontWeight: "800", cursor: (saving || !estDifferent) ? "default" : "pointer", opacity: saving ? 0.7 : 1, transition: "background-color 0.2s ease, color 0.2s ease" }}>
          {saving ? "Enregistrement…" : dejaEnregistre ? "Modifier" : "Enregistrer"}
        </button>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: "90px", left: "50%", transform: "translateX(-50%)", padding: "10px 18px", borderRadius: "20px", backgroundColor: "#080812", color: "#fff", fontSize: "12.5px", fontWeight: "700", animation: "toastIn 0.25s ease", zIndex: 300 }}>
          {toast}
        </div>
      )}

      {confirmQuitOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setConfirmQuitOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "24px 20px calc(env(safe-area-inset-bottom) + 20px)", width: "100%", maxWidth: "480px", animation: "toastIn 0.25s ease" }}>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "800", marginBottom: "8px" }}>Enregistrer avant de quitter ?</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: "1.5", marginBottom: "20px" }}>Vous avez changé votre sélection sans l'enregistrer. Sans ça, ces changements seront perdus.</div>
            <button onClick={() => enregistrer(() => router.push("/?menu=1"))} disabled={saving} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: "pointer", marginBottom: "10px" }}>
              {saving ? "Enregistrement…" : "Enregistrer et quitter"}
            </button>
            <button onClick={() => setConfirmQuitOpen(false)} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "24px", border: "none", backgroundColor: "transparent", color: t2, fontSize: "14.5px", fontWeight: "700", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
