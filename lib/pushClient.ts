// Client (navigateur) — chantier "Yelen Assistant" (20/07/2026), Lot D.
// Enregistre le service worker + s'abonne au Push API avec la clé VAPID
// publique. Ne contient aucun secret (clé publique seulement, exposable).

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type SubscriptionPayload = { endpoint: string; p256dh: string; auth: string; userAgent: string };

// Retourne null si non supporté, permission refusée, ou clé VAPID absente —
// jamais d'exception non gérée (utilisé depuis des flux non critiques :
// onboarding, paramètres).
export async function souscrirePush(): Promise<SubscriptionPayload | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent };
  } catch (err) {
    console.error("[pushClient] souscription échouée:", err);
    return null;
  }
}
