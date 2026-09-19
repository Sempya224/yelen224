"use client";

// Sélecteur de position (décision CEO 06/08/2026, préparation onglet Carte
// citoyen) — react-leaflet est déjà une dépendance réelle du projet
// (components/CarteMap.tsx, affichage seul), mais aucun marqueur
// déplaçable n'existait encore. Deux façons de fixer la position, toutes
// deux contrôlées côté client (jamais une saisie libre de coordonnées) :
// glisser le repère, ou toucher/cliquer un point de la carte. Le centre par
// défaut (avant toute position choisie) vient de lib/villesCoordonnees.ts —
// une approximation de la ville, jamais utilisée comme position finale.
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { type ThemeTokens, toUiTokens } from "../theme";
import { coordonneesParVille } from "@/lib/villesCoordonnees";
import { Button } from "@/components/ui/Button";

function buildPinIcon(gold: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11.25 15 25 15 25s15-13.75 15-25C30 6.7 23.3 0 15 0z" fill="${gold}" stroke="#080812" stroke-width="1.5"/><circle cx="15" cy="15" r="5.5" fill="#080812"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}

function ClicCarte({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export function LocationPicker({ latitude, longitude, ville, onChange, C }: {
  latitude: number | null; longitude: number | null; ville: string;
  onChange: (lat: number, lng: number) => void; C: ThemeTokens;
}) {
  const [mounted, setMounted] = useState(false);
  const [localisation, setLocalisation] = useState(false);
  // queueMicrotask (même convention qu'ailleurs, ex. EquipeTab.tsx) : évite
  // react-hooks/set-state-in-effect sur ce setState synchrone en tête
  // d'effet, sans changer le comportement (s'exécute avant tout rendu).
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  const aPosition = latitude !== null && longitude !== null && !Number.isNaN(latitude) && !Number.isNaN(longitude);
  const defaut = coordonneesParVille(ville);
  const center: [number, number] = aPosition ? [latitude as number, longitude as number] : [defaut.lat, defaut.lng];

  function utiliserPositionActuelle() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocalisation(true);
    navigator.geolocation.getCurrentPosition(
      pos => { onChange(pos.coords.latitude, pos.coords.longitude); setLocalisation(false); },
      () => setLocalisation(false),
      { timeout: 8000 }
    );
  }

  return (
    <div>
      <div style={{ position: "relative", zIndex: 0, borderRadius: "14px", overflow: "hidden", border: `1px solid ${C.border2}`, height: "240px" }}>
        {mounted && (
          <MapContainer center={center} zoom={aPosition ? 15 : 12} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
            <Marker
              position={center}
              icon={buildPinIcon(C.gold)}
              draggable
              eventHandlers={{
                dragend: e => {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  onChange(pos.lat, pos.lng);
                },
              }}
            />
            <ClicCarte onPick={onChange}/>
          </MapContainer>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
        <div style={{ color: aPosition ? C.t2 : C.t3, fontSize: "11px", fontWeight: "600" }}>
          {aPosition ? `${(latitude as number).toFixed(5)}, ${(longitude as number).toFixed(5)}` : "Position non renseignée — repère placé sur le centre approximatif de votre ville"}
        </div>
        <Button
          tokens={toUiTokens(C)}
          className="tap"
          variant="secondary"
          size="sm"
          disabled={localisation}
          style={{ flexShrink: 0 }}
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>}
          onClick={utiliserPositionActuelle}
        >
          {localisation ? "Localisation…" : "Utiliser ma position actuelle"}
        </Button>
      </div>
      <p style={{ color: C.t3, fontSize: "10.5px", lineHeight: 1.5, marginTop: "6px" }}>
        Glissez le repère ou touchez la carte pour indiquer l&apos;emplacement exact de votre établissement — c&apos;est cette position qui sera affichée aux citoyens sur la carte Yelen.
      </p>
    </div>
  );
}
