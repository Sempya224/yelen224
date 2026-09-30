"use client";

import { useState } from "react";

// Client Component isolé — page.tsx (Server Component) ne peut pas
// contenir "use client", d'où ce fichier séparé pour la seule partie
// interactive de l'écran de vérification.
export function ConfirmerVerificationButton({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [erreur, setErreur] = useState("");

  const confirmer = async () => {
    setStatus("sending");
    try {
      const res = await fetch("/api/support/public/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: string; rawTokenSuivi?: string } | null;
      if (!res.ok || !json?.ok || !json.rawTokenSuivi) {
        setErreur(json?.error || "Une erreur est survenue.");
        setStatus("error");
        return;
      }
      // Navigation complète (pas un fetch) vers la route qui échange le
      // token de suivi contre un cookie httpOnly et nettoie l'URL — le
      // token n'apparaît dans la barre d'adresse que pour cette unique
      // requête, jamais après (voir technical design §8).
      window.location.href = `/api/support/public/suivi/session?token=${encodeURIComponent(json.rawTokenSuivi)}`;
    } catch {
      setErreur("Une erreur réseau est survenue. Réessayez.");
      setStatus("error");
    }
  };

  return (
    <div>
      <button
        onClick={confirmer}
        disabled={status === "sending"}
        style={{
          background: status === "sending" ? "rgba(200,140,0,0.3)" : "#F5A623",
          color: "#1a1200", fontWeight: 800, fontSize: 15, padding: "14px 28px",
          borderRadius: 14, border: "none", width: "100%",
          cursor: status === "sending" ? "not-allowed" : "pointer",
        }}
      >
        {status === "sending" ? "Vérification en cours..." : "Confirmer mon adresse email"}
      </button>
      {status === "error" && (
        <p style={{ color: "#dc2626", marginTop: 12, fontSize: 13 }}>{erreur}</p>
      )}
    </div>
  );
}
