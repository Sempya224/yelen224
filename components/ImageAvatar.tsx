"use client";

import Image from "next/image";
import { useState } from "react";

// Migration next/image (audit CEO 08/08/2026) — couvre le pattern
// dominant du projet : logo/avatar/icône dans un conteneur carré ou rond
// de taille fixe en pixels, object-fit cover, repli sur initiales si src
// absent ou en erreur. `taille` en px pour rester cohérent avec l'Avatar
// déjà existant dans components/CommunautePostCard.tsx (déjà aliasé
// `Avatar as CommunauteAvatar` ailleurs dans le code, signe que ce nom
// générique était déjà anticipé).
function initiales(nom: string): string {
  return (
    nom
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ImageAvatar({
  src,
  alt,
  taille,
  radius = "50%",
  background = "linear-gradient(135deg,#F5A623,#C8940A)",
  color = "#080812",
  objectFit = "cover",
  border,
}: {
  src: string | null | undefined;
  alt: string;
  taille: number;
  radius?: string | number;
  background?: string;
  color?: string;
  objectFit?: "cover" | "contain";
  border?: string;
}) {
  const [erreur, setErreur] = useState(false);

  if (!src || erreur) {
    return (
      <div
        style={{
          width: taille,
          height: taille,
          borderRadius: radius,
          background,
          border,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          fontWeight: 900,
          fontSize: taille * 0.4,
          flexShrink: 0,
        }}
      >
        {initiales(alt)}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: taille, height: taille, borderRadius: radius, overflow: "hidden", border, flexShrink: 0 }}>
      <Image src={src} alt={alt} fill sizes={`${taille}px`} style={{ objectFit }} onError={() => setErreur(true)} />
    </div>
  );
}
