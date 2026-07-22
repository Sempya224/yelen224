"use client";

// Écran "Notifications" (menu Compte → Paramètres) — chantier "Yelen
// Assistant" (20/07/2026). Remplace le stub CompteEcranVide. Contenu :
// activation/désactivation du push navigateur (aucun contrôle citoyen
// n'existait avant ce chantier — l'abonnement se faisait silencieusement
// dans app/page.tsx). Les préférences de communication (Communications
// Yelen/établissements, Personnalisation) restent gérées dans
// /compte/confidentialite (déjà réel, chantier Confidentialité, 18/07/2026)
// — affichées ici en résumé lecture seule + lien, plutôt que de dupliquer
// les mêmes interrupteurs à deux endroits (même logique que le lien
// "Télécharger mes données" déjà en place entre ces deux écrans).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { souscrirePush } from "@/lib/pushClient";

function Section({ titre, t1, children }: { titre: string; t1: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "24px" }}>
      <div style={{ color: t1, fontSize: "13px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "12px" }}>{titre}</div>
      {children}
    </section>
  );
}

type EtatPush = "verification" | "actif" | "inactif" | "refuse" | "indisponible";

export function NotificationsClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushEtat, setPushEtat] = useState<EtatPush>("verification");
  const [pushBusy, setPushBusy] = useState(false);
  const [commPrefs, setCommPrefs] = useState<{ communications_yelen: boolean; communications_etablissements: boolean; personnalisation: boolean } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const verifierPush = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushEtat("indisponible"); return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "denied") { setPushEtat("refuse"); return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setPushEtat(sub ? "actif" : "inactif");
    } catch { setPushEtat("inactif"); }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const charger = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    const res = await fetch("/api/citoyen/confidentialite/status", { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) {
      setCommPrefs({
        communications_yelen: json.communications_yelen,
        communications_etablissements: json.communications_etablissements,
        personnalisation: json.personnalisation,
      });
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await Promise.all([verifierPush(), charger()]); setLoading(false); })();
  }, [router, verifierPush, charger]);

  async function activerPush() {
    if (!userId) return;
    setPushBusy(true);
    try {
      const sub = await souscrirePush();
      if (!sub) {
        await verifierPush();
        showToast("Activation impossible — vérifiez la permission de notifications de votre navigateur.", "error");
        return;
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        destinataire_id: userId, destinataire_type: "citoyen",
        endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent,
      }, { onConflict: "endpoint" });
      if (error) { showToast("Erreur lors de l'activation.", "error"); return; }
      setPushEtat("actif");
      showToast("Notifications push activées sur cet appareil.");
    } finally { setPushBusy(false); }
  }

  async function desactiverPush() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setPushEtat("inactif");
      showToast("Notifications push désactivées sur cet appareil.");
    } finally { setPushBusy(false); }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const pushLabel: Record<EtatPush, string> = {
    verification: "Vérification…",
    actif: "Activées sur cet appareil",
    inactif: "Désactivées sur cet appareil",
    refuse: "Bloquées par votre navigateur",
    indisponible: "Non disponible sur ce navigateur",
  };
  const pushColor: Record<EtatPush, string> = {
    verification: t3, actif: "#22c55e", inactif: t2, refuse: "#ef4444", indisponible: t3,
  };

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Notifications"/>

      <div style={{ padding: "20px 16px 60px" }}>
        <Section titre="Notifications push" t1={t1}>
          <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px", border: `1px solid ${brd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: pushEtat === "refuse" ? "10px" : 0 }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `${pushColor[pushEtat]}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: pushColor[pushEtat] }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "14px", fontWeight: "700" }}>Notifications push</div>
                <div style={{ color: pushColor[pushEtat], fontSize: "12px", fontWeight: "600", marginTop: "1px" }}>{pushLabel[pushEtat]}</div>
              </div>
              {(pushEtat === "actif" || pushEtat === "inactif") && (
                <button onClick={pushEtat === "actif" ? desactiverPush : activerPush} disabled={pushBusy} className="tap" style={{ backgroundColor: pushEtat === "actif" ? "transparent" : "#F5A623", color: pushEtat === "actif" ? t2 : "#000", border: `1px solid ${pushEtat === "actif" ? brd : "transparent"}`, borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer", flexShrink: 0 }}>
                  {pushBusy ? "…" : pushEtat === "actif" ? "Désactiver" : "Activer"}
                </button>
              )}
            </div>
            {pushEtat === "refuse" && (
              <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.6 }}>
                Les notifications ont été bloquées dans les réglages de votre navigateur. Pour les réactiver, autorisez les notifications pour Yelen224 depuis les paramètres de votre navigateur, puis revenez sur cet écran.
              </div>
            )}
          </div>
          <div style={{ color: t3, fontSize: "11px", lineHeight: 1.6, marginTop: "8px", padding: "0 4px" }}>
            Reçues même l'application fermée, uniquement sur cet appareil — vous devrez réactiver séparément sur chaque nouvel appareil.
          </div>
        </Section>

        <Section titre="Préférences de communication" t1={t1}>
          <div style={{ backgroundColor: card, borderRadius: "16px", border: `1px solid ${brd}`, overflow: "hidden" }}>
            {commPrefs && [
              { label: "Communications Yelen", on: commPrefs.communications_yelen },
              { label: "Communications établissements", on: commPrefs.communications_etablissements },
              { label: "Personnalisation", on: commPrefs.personnalisation },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }}>
                <span style={{ color: t1, fontSize: "13px", fontWeight: "600" }}>{row.label}</span>
                <span style={{ color: row.on ? "#22c55e" : t3, fontSize: "12px", fontWeight: "700" }}>{row.on ? "Activé" : "Désactivé"}</span>
              </div>
            ))}
            <Link href="/compte/confidentialite" className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>
              Gérer ces préférences
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>
        </Section>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
