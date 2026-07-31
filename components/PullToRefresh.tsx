"use client";

import { useRef, useState } from "react";
import { YelenLoader } from "@/components/YelenLoader";

// Le rond doit rester visible sous le header fixe (position:fixed,
// ~110-130px selon l'appareil avec l'encoche/île dynamique) : seuil et
// tirage max volontairement généreux + ancrage en bas de la zone (pas
// centré) pour ne jamais finir caché derrière le header pendant le geste
// (bug réel du 23/07/2026 : un rond centré restait invisible sous le
// header tant que le tirage n'était pas déjà très prononcé).
const THRESHOLD = 140;
const MAX_PULL = 180;

// Geste tirer-pour-rafraîchir façon Capital One/apps natives (retour CEO
// 23/07/2026) : le spinner apparaît dans le flux du contenu, sous le
// header (qui reste position:fixed, totalement indépendant, jamais
// entraîné par ce geste). Détecte le tirage uniquement quand la page est
// déjà tout en haut (window.scrollY <= 0), sinon laisse le scroll normal
// se produire.
export function PullToRefresh({ onRefresh, isDark, children }: { onRefresh: () => Promise<void>; isDark?: boolean; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = (!refreshing && window.scrollY <= 0) ? e.touches[0].clientY : null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    if (window.scrollY > 0) { startY.current = null; setPull(0); return; }
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPull(0); return; }
    e.preventDefault();
    setPull(Math.min(delta * 0.5, MAX_PULL));
  }

  async function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const height = refreshing ? THRESHOLD : pull;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{ height, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "10px", transition: pull === 0 || refreshing ? "height 0.25s ease" : "none" }}>
        {height > 4 && (
          <div style={{
            width: "38px", height: "38px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isDark ? "rgba(8,8,18,0.85)" : "rgba(8,8,18,0.75)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            opacity: Math.max(Math.min(height / THRESHOLD, 1), 0.6),
          }}>
            <YelenLoader size={20} color="#F5A623"/>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
