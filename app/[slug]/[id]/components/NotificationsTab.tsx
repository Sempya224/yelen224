"use client";

// Écran dédié "Notifications" — extrait de ParametresTab.tsx (chantier
// éclatement de Paramètres, 14/09/2026) : préférences par catégorie +
// notifications push navigateur. Toutes les actions passent par des routes
// serveur avec vérification d'ownership JWT (cf. lib/institutionAuth.ts).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { souscrirePush } from "@/lib/pushClient";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type NotifCategory = "confirmation" | "rappels" | "annulation_report" | "rdv_termine";
type ChannelPrefs = { inapp: boolean; email: boolean; sms: boolean };
type NotificationPrefs = Record<NotifCategory, ChannelPrefs>;

const DEFAULT_PREFS: NotificationPrefs = {
  confirmation: { inapp: true, email: false, sms: false },
  rappels: { inapp: true, email: false, sms: false },
  annulation_report: { inapp: true, email: false, sms: false },
  rdv_termine: { inapp: true, email: false, sms: false },
};

const NOTIF_LABELS: Record<NotifCategory, { titre: string; desc: string }> = {
  confirmation: { titre: "Confirmations de RDV", desc: "Un nouveau rendez-vous est confirmé" },
  rappels: { titre: "Rappels avant RDV", desc: "24h, 30 min et à l'heure du rendez-vous" },
  annulation_report: { titre: "Annulations et reports", desc: "Un RDV est annulé ou reporté" },
  rdv_termine: { titre: "RDV terminés", desc: "Un rendez-vous est marqué terminé" },
};

function Toggle({ C, checked, onChange, disabled }: { C: ThemeTokens; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      className={disabled ? undefined : "tap"}
      disabled={disabled}
      style={{ width: "38px", height: "22px", borderRadius: "20px", border: "none", padding: "2px", backgroundColor: disabled ? C.bg3 : checked ? C.gold : C.border2, cursor: disabled ? "not-allowed" : "pointer", display: "flex", justifyContent: checked ? "flex-end" : "flex-start", flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
    >
      <div style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: disabled ? C.t3 : checked ? "#000" : C.t1 }} />
    </button>
  );
}

export function NotificationsTab({ }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<NotifCategory | null>(null);
  const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);

  // Chantier "Yelen Assistant" (20/07/2026), Lot D — push navigateur.
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  function notify(text: string, color: string) {
    setMsg({ text, color });
    setTimeout(() => setMsg(null), 3500);
  }

  useEffect(() => {
    (async () => {
      try {
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setPushEnabled(!!sub);
      } catch { /* silencieux */ }
    })();
  }, []);

  async function activerPush() {
    setPushLoading(true);
    try {
      const sub = await souscrirePush();
      if (!sub) { notify("Activation impossible — vérifiez la permission de notifications du navigateur.", C.red); return; }
      const res = await fetch("/api/institution/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent }),
      });
      if (!res.ok) { notify("Erreur lors de l'activation.", C.red); return; }
      setPushEnabled(true);
      notify("Notifications push activées sur cet appareil.", C.green);
    } finally { setPushLoading(false); }
  }

  async function loadPrefs() {
    setPrefsLoading(true);
    try {
      const res = await fetch("/api/institution/notification-prefs");
      const data = await res.json();
      if (res.ok && data.prefs) setPrefs(data.prefs);
    } catch { /* garde les défauts */ }
    setPrefsLoading(false);
  }

  useEffect(() => { loadPrefs(); }, []);

  async function togglePref(category: NotifCategory) {
    const nextValue = !prefs[category].inapp;
    setSavingCategory(category);
    setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: nextValue } }));
    try {
      const res = await fetch("/api/institution/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, inapp: nextValue }),
      });
      if (!res.ok) {
        setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: !nextValue } }));
        notify("Erreur lors de l'enregistrement", C.red);
      }
    } catch {
      setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: !nextValue } }));
      notify("Erreur réseau", C.red);
    }
    setSavingCategory(null);
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "16px" }}>Notifications</h1>

        {msg && (
          <div style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: C.bgCard2, border: `1px solid ${msg.color}40`, borderLeft: `3px solid ${msg.color}`, borderRadius: "12px", padding: "10px 16px", color: C.t1, fontSize: "12px", fontWeight: "700", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
            {msg.text}
          </div>
        )}

        <Card tokens={toCardTokens(C)} noPadding>
          <div style={{ padding: "10px 16px 4px", display: "flex", gap: "8px", color: C.t3, fontSize: "9px", fontWeight: "800", textTransform: "uppercase" }}>
            <span style={{ flex: 1 }} />
            <span style={{ width: "38px", textAlign: "center" }}>App</span>
            <span style={{ width: "50px", textAlign: "center" }}>Email</span>
            <span style={{ width: "44px", textAlign: "center" }}>SMS</span>
          </div>
          {(Object.keys(NOTIF_LABELS) as NotifCategory[]).map((cat, i, arr) => (
            <div key={cat} style={{ padding: "11px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{NOTIF_LABELS[cat].titre}</div>
                <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{NOTIF_LABELS[cat].desc}</div>
              </div>
              <div style={{ width: "38px", display: "flex", justifyContent: "center" }}>
                <Toggle C={C} checked={prefs[cat].inapp} onChange={() => togglePref(cat)} disabled={prefsLoading || savingCategory === cat} />
              </div>
              <div style={{ width: "50px", display: "flex", justifyContent: "center" }} title="Bientôt disponible">
                <Toggle C={C} checked={false} onChange={() => {}} disabled />
              </div>
              <div style={{ width: "44px", display: "flex", justifyContent: "center" }} title="Bientôt disponible">
                <Toggle C={C} checked={false} onChange={() => {}} disabled />
              </div>
            </div>
          ))}
          <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div>
              <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>Notifications push (navigateur)</div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Reçues même app fermée, sur cet appareil</div>
            </div>
            {pushEnabled ? (
              <span style={{ color: C.green, fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>Activées</span>
            ) : (
              <Button tokens={toUiTokens(C)} variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}40` }} loading={pushLoading} onClick={activerPush} className="tap">
                Activer
              </Button>
            )}
          </div>
          <div style={{ padding: "10px 16px", backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div>
              <div style={{ color: C.t2, fontSize: "12px", fontWeight: "700" }}>RDV dépassés — action requise</div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Alerte opérationnelle, toujours active</div>
            </div>
            <span style={{ color: C.t3, fontSize: "9px", fontWeight: "800", textTransform: "uppercase" }}>Toujours actif</span>
          </div>
          <div style={{ padding: "9px 16px", color: C.t3, fontSize: "10px", lineHeight: 1.5 }}>
            Email et SMS arrivent bientôt — pour l&apos;instant, toutes les notifications sont envoyées dans l&apos;application.
          </div>
        </Card>
      </div>
    </div>
  );
}
