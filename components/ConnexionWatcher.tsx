"use client";

// Système Yelen de détection de connexion (retour Bryan 09/08/2026) — global,
// mêmes conventions que AuthSessionWatcher (composant sans rendu métier,
// monté une fois dans app/layout.tsx, actif sur tout le produit : citoyen,
// institution, admin, portail employé). Deux volets :
// 1. Bandeau fixe (rouge hors connexion, vert bref au retour). Les événements
//    natifs `online`/`offline` du navigateur ne sont qu'un déclencheur — sur
//    mobile ils ne se redéclenchent pas de façon fiable (mise en arrière-plan,
//    veille, bascule wifi/4G), donc l'état réel est toujours confirmé par une
//    requête réseau (`/favicon.ico`), et une sonde périodique + une
//    revérification au retour au premier plan permettent de sortir de l'état
//    hors-connexion même si aucun événement `online` n'arrive jamais.
// 2. Message d'action bloquée : tant que hors connexion, tout clic sur un
//    élément interactif (button/a/[role=button]) déclenche un petit toast
//    rouge. Simplification assumée : un clic sur un élément qui ne
//    déclenche aucun appel réseau (ex. changer d'onglet côté client)
//    affichera aussi le toast — détecter précisément "ce clic va faire un
//    fetch" nécessiterait d'instrumenter chaque bouton du produit, hors
//    périmètre de cette brique. Le bandeau reste la source de vérité
//    principale, le toast n'est qu'un rappel contextuel au moment du geste.
import { useEffect, useRef, useState } from "react";

export function ConnexionWatcher() {
  // Ne jamais faire confiance a navigator.onLine pour l'etat initial : il peut
  // renvoyer false de facon transitoire au chargement (reveil de veille,
  // onglet remis au premier plan) alors que la connexion est reelle. Il ne
  // sert que de declencheur pour confirmOffline() ci-dessous, jamais de
  // source de verite — coherent avec le principe deja documente en tete de
  // fichier. Corrige un bandeau "hors connexion" qui restait bloque en
  // permanence quand cette hypothese initiale etait fausse (confirmOffline
  // ne faisait rien quand la sonde reseau confirmait au contraire etre en ligne).
  const [online, setOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [actionToast, setActionToast] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkIdRef = useRef(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const stopPoll = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const checkConnectivity = (): Promise<boolean> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      return fetch("/favicon.ico", { method: "HEAD", cache: "no-store", signal: controller.signal })
        .then(() => true)
        .catch(() => false)
        .finally(() => clearTimeout(timeout));
    };

    const goOnline = () => {
      checkIdRef.current++; // annule une verification "offline" encore en vol
      stopPoll();
      setOnline(true);
      setShowReconnected(true);
      setDismissed(false);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => setShowReconnected(false), 3000);
    };

    // On ne bascule le bandeau en hors-connexion qu'apres confirmation par une
    // vraie requete reseau (evite les faux "offline" du navigateur). Une fois
    // confirme, on sonde nous-memes la reconnexion : l'evenement "online" ne
    // suffit pas seul sur mobile.
    const confirmOffline = () => {
      const myCheckId = ++checkIdRef.current;
      checkConnectivity().then((ok) => {
        if (checkIdRef.current !== myCheckId) return;
        if (ok) return;
        setOnline(false);
        setShowReconnected(false);
        setDismissed(false);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        if (!pollTimer) {
          pollTimer = setInterval(() => {
            checkConnectivity().then((backOnline) => {
              if (backOnline) goOnline();
            });
          }, 5000);
        }
      });
    };

    const handleOffline = () => confirmOffline();
    const handleOnline = () => goOnline();
    const handleVisible = () => {
      // Retour au premier plan (mobile surtout) : revalider tout de suite au
      // lieu d'attendre jusqu'a 5s la prochaine sonde.
      if (document.visibilityState === "visible" && !onlineRef.current) confirmOffline();
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) confirmOffline();

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPoll();
    };
  }, []);

  useEffect(() => {
    if (online) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("button, a[href], [role='button']")) return;
      setActionToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setActionToast(false), 2600);
    };
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [online]);

  if ((online || dismissed) && !showReconnected && !actionToast) return null;

  return (
    <>
      {(!online || showReconnected) && !dismissed && (
        <div
          role="status"
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
            paddingTop: "env(safe-area-inset-top)",
            backgroundColor: !online ? "#ef4444" : "#22c55e",
            transition: "background-color 0.25s ease",
          }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "8px 40px" }}>
            {!online ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            <span style={{ color: "#fff", fontSize: "12.5px", fontWeight: "700" }}>
              {!online ? "Vous êtes hors connexion — certaines actions sont indisponibles." : "Connexion rétablie."}
            </span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Fermer"
              style={{
                position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", padding: "6px", margin: 0, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {actionToast && !online && (
        <div
          role="alert"
          style={{
            position: "fixed", left: "50%", bottom: "calc(96px + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)", zIndex: 999,
            backgroundColor: "#ef4444", color: "#fff", fontSize: "12.5px", fontWeight: "700",
            padding: "10px 16px", borderRadius: "12px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            maxWidth: "88vw", textAlign: "center",
          }}
        >
          Cette action nécessite une connexion internet.
        </div>
      )}
    </>
  );
}
