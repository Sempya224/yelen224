"use client";

import Image, { type ImageProps } from "next/image";
import { CSSProperties } from "react";

// Migration next/image (audit CEO 08/08/2026) — couvre les images
// rectangulaires (contenu, galerie, hero) par opposition à ImageAvatar
// (logos/avatars circulaires ou carrés de taille fixe). Le conteneur
// parent DOIT être position:relative (souvent déjà overflow:hidden,
// rarement position:relative explicite avec <img> classique — seul
// changement structurel systématique à appliquer au parent). `sizes` est
// obligatoire (pas de valeur par défaut) pour forcer une réflexion par cas
// plutôt qu'un "100vw" copié partout, qui dégraderait le srcset généré sur
// les petites vignettes.
export function MediaCover({
  src,
  alt,
  sizes,
  priority = false,
  objectFit = "cover",
  style,
  className,
  onError,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  objectFit?: "cover" | "contain";
  style?: CSSProperties;
  className?: string;
  onError?: ImageProps["onError"];
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ objectFit, ...style }}
      onError={onError}
    />
  );
}
