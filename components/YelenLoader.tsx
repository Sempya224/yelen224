"use client";

import { YelenLogo } from "./YelenLogo";

// Chargement Yelen — décision CEO (26/07/2026) : un seul indicateur de
// chargement dans toute l'application, le logo Yelen (soleil) qui tourne
// sur lui-même, façon indicateur de marque Anthropic/Claude — plus de
// spinner générique, plus de cercle radar, plus de simple texte
// "Chargement...". Composant central unique : ne jamais redéfinir un
// indicateur de chargement localement ailleurs, toujours importer
// celui-ci. Le déploiement se fait écran par écran (voir CLAUDE.md,
// protocole "un écran à la fois") — un nouvel écran qui a besoin d'un
// indicateur de chargement doit utiliser YelenLoader dès le départ.
export function YelenLoader({
  size = 32,
  color = "#F5A623",
  label,
  labelColor,
}: {
  size?: number;
  color?: string;
  label?: string;
  labelColor?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div className="yelen-loader-tourne" style={{ display: "flex" }}>
        <YelenLogo size={size} color={color} strokeWidth={2.4}/>
      </div>
      {label && <div style={{ color: labelColor ?? color, fontSize: "13px", fontWeight: 700 }}>{label}</div>}
      <style>{`
        .yelen-loader-tourne { animation: yelenLoaderTourne 1s linear infinite; }
        @keyframes yelenLoaderTourne { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @media (prefers-reduced-motion: reduce) {
          .yelen-loader-tourne { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// Variante plein écran — remplace les blocs `<div style={{padding:"60px
// 20px", textAlign:"center"}}>Chargement…</div>` dispersés dans le
// projet. `fond` optionnel pour matcher le bg de l'écran appelant (sinon
// transparent, hérite du parent).
export function YelenLoaderEcran({
  label = "Chargement…",
  color = "#F5A623",
  labelColor,
  fond,
}: {
  label?: string;
  color?: string;
  labelColor?: string;
  fond?: string;
}) {
  return (
    <div style={{ padding: "60px 20px", display: "flex", justifyContent: "center", background: fond }}>
      <YelenLoader size={36} color={color} label={label} labelColor={labelColor}/>
    </div>
  );
}
