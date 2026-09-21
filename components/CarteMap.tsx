'use client'

// Refonte onglet 3 "Vue Carte" (décision CEO 06/08/2026) — inspiré des
// principes Yelp (carte plein écran + carrousel de résultats synchronisé),
// pas une copie littérale. CarteMap devient un composant contrôlé : la
// sélection (`selectedId`) et le zonage visible (`onZoneChange`) sont
// pilotés par le parent (app/recherche/page.tsx), qui possède le carrousel
// de cartes — cette carte ne rend plus elle-même de bottom sheet de détail.
import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GUINEE_CONTOUR_LATLNG } from '@/lib/guineeContourLatLng'

type Institution = {
  id: string
  name: string
  ville: string
  quartier: string | null
  category: string | null
  latitude: number
  longitude: number
  logo: string | null
  badge_verifie: boolean
  moyenne_avis: number | null
  nb_avis: number | null
}

const GOLD = '#F5A623'

function initiales(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
}

// Icône générique uniforme, avant toute sélection (retour Bryan 21/08/2026)
// — jamais la photo/le logo individuel de l'établissement tant qu'il n'a
// pas été cliqué (sinon la carte affiche des dizaines de photos différentes
// et perd toute lisibilité) ; même glyphe "bâtiment" déjà utilisé comme
// repli catégorie générique ailleurs sur la carte (components/CarteMapHome.tsx
// ::DEFAULT_CAT), pour rester cohérent visuellement entre les deux cartes.
const ICONE_GENERIQUE_SVG = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="#080812" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`

// Repère personnalisé (SVG en chaîne HTML — contrainte Leaflet, un
// divIcon ne peut pas rendre un composant React). Institution vérifiée =
// anneau gold + pastille de contrôle ; sinon anneau neutre. Le repère
// sélectionné grossit, révèle le vrai logo/initiales de l'établissement et
// passe en fond gold plein, cohérent avec l'accent gold "action/sélection"
// du reste de l'écran (§1 refonte onglet 1).
function buildIcon(inst: Institution, actif: boolean): L.DivIcon {
  const size = actif ? 46 : 34
  const anneau = inst.badge_verifie ? GOLD : (actif ? '#111111' : '#ffffff')
  const inner = !actif
    ? `<div style="width:100%;height:100%;border-radius:50%;background:${GOLD};display:flex;align-items:center;justify-content:center;">${ICONE_GENERIQUE_SVG}</div>`
    : inst.logo
    ? `<img src="${inst.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
    : `<div style="width:100%;height:100%;border-radius:50%;background:${GOLD};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.32)}px;font-weight:900;color:#080812;">${initiales(inst.name)}</div>`
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${size}px;height:${size + 8}px;">
        <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:3px solid ${anneau};box-shadow:0 2px 8px rgba(0,0,0,0.35);">${inner}</div>
        ${inst.badge_verifie ? `<div style="position:absolute;bottom:4px;right:-2px;width:15px;height:15px;border-radius:50%;background:${GOLD};border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#080812" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
        <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${anneau};"></div>
      </div>
    `,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 8],
  })
}

// Corrige le bug réel observé le 06/08/2026 (repère mal placé/carte
// zoomée sur le monde entier tant qu'on n'a pas manuellement zoomé) —
// Leaflet mesure la taille de son conteneur à l'initialisation ; si le
// conteneur n'a pas encore atteint sa taille finale à cet instant précis
// (mise en page différée par les marges négatives de la vue Carte, rendu
// conditionnel, etc.), tous ses calculs pixel↔lat/long restent faux
// jusqu'à ce qu'une interaction utilisateur (zoom/pan) force Leaflet à
// recalculer. `invalidateSize()` force ce recalcul explicitement.
function InvalidateOnMount() {
  const map = useMap()
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 0)
    const t2 = setTimeout(() => map.invalidateSize(), 250)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [map])
  return null
}

// Positionnement de la carte — cadrage initial PUIS survol des sélections
// suivantes, réunis dans un seul composant pour éliminer la course qui
// causait le bug réel du 06/08/2026 (repère mal placé tant qu'on n'a pas
// zoomé manuellement) : `FitBounds` et `FlyToSelected` séparés pouvaient
// s'exécuter quasi simultanément (le parent sélectionne automatiquement le
// premier résultat dès que les institutions chargent), et seul l'un des
// deux appelait `invalidateSize()` avant de bouger la carte — selon lequel
// gagnait la course, le cadrage final héritait d'une taille de conteneur
// obsolète. Ici : un seul cadrage initial (jamais animé, jamais de course),
// qui recalcule systématiquement la taille du conteneur juste avant de
// positionner ; les changements de sélection ultérieurs (après ce premier
// cadrage) utilisent un flyTo animé, avec le même recalcul systématique.
function MapPositioning({ institutions, selectedId }: { institutions: Institution[]; selectedId: string | null }) {
  const map = useMap()
  const initialise = useRef(false)

  useEffect(() => {
    // Attend que les institutions soient chargées avant de trancher
    // cible/fallback — évite un flash "pays entier" suivi d'un flyTo vers le
    // 1er résultat auto-sélectionné dès que les données arrivent (course déjà
    // corrigée une fois le 06/08/2026, voir commentaire au-dessus).
    if (initialise.current || institutions.length === 0) return
    initialise.current = true
    const t = setTimeout(() => {
      map.invalidateSize()
      const cible = selectedId ? institutions.find(i => i.id === selectedId) : null
      if (cible) {
        map.setView([cible.latitude, cible.longitude], 14)
      } else {
        // Cadrage par défaut = pays entier visible (retour Bryan 22/08/2026,
        // capture d'écran de référence à l'appui) — remplace l'ancienne
        // priorité à citoyenGeoloc (retour Bryan 21/08/2026) qui provoquait
        // un fitBounds sur les seules institutions géolocalisées, un cadrage
        // incohérent/dézoomé sur une sous-région selon leur répartition. Le
        // recentrage sur la position réelle reste possible explicitement via
        // le bouton "Ma position" (BoutonMaPosition ci-dessous).
        const bounds = L.latLngBounds(GUINEE_CONTOUR_LATLNG.flat())
        map.fitBounds(bounds, { padding: [16, 16] })
      }
    }, 60)
    return () => clearTimeout(t)
  }, [institutions, selectedId, map])

  useEffect(() => {
    if (!initialise.current || !selectedId) return
    const inst = institutions.find(i => i.id === selectedId)
    if (!inst) return
    map.invalidateSize()
    map.flyTo([inst.latitude, inst.longitude], Math.max(map.getZoom(), 14), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return null
}

// Détecte les déplacements DÉCLENCHÉS PAR L'UTILISATEUR (glisser/zoomer),
// jamais un flyTo/fitBounds programmatique — sinon le bouton "Rechercher
// dans cette zone" apparaîtrait dès le cadrage initial. Heuristique : un
// drag utilisateur déclenche toujours `dragstart` ; un zoom utilisateur
// (molette/pincement) porte un `originalEvent`, un zoom programmatique non.
function ZoneWatcher({ institutions, onZoneChange }: { institutions: Institution[]; onZoneChange?: (ids: string[], parUtilisateur: boolean) => void }) {
  const interactionRef = useRef(false)
  useMapEvents({
    dragstart() { interactionRef.current = true },
    zoomstart(e) { if ((e as unknown as { originalEvent?: unknown }).originalEvent) interactionRef.current = true },
    moveend(e) {
      if (!onZoneChange) return
      const map = e.target as L.Map
      const bounds = map.getBounds()
      const ids = institutions.filter(i => bounds.contains([i.latitude, i.longitude])).map(i => i.id)
      onZoneChange(ids, interactionRef.current)
      interactionRef.current = false
    },
  })
  return null
}

// "Ma position" (décision CEO 09/08/2026) — indicateur de position réelle
// de l'utilisateur sur la carte, logo Yelen officiel (composants/YelenLogo.tsx
// dupliqué en HTML brut ici, un divIcon Leaflet ne peut pas rendre un
// composant React) au lieu du point bleu classique, avec cercle de
// précision réel (rayon = pos.coords.accuracy, jamais une valeur inventée).
// Suivi continu (watchPosition, pas un simple instantané) pour que le
// marqueur suive les déplacements — react-leaflet re-positionne le
// <Marker> automatiquement quand sa prop `position` change, aucune
// interpolation manuelle ajoutée (mouvement "fluide" au sens de mises à
// jour GPS successives rapprochées, pas d'animation image par image).
//
// La permission n'est JAMAIS redemandée automatiquement au chargement de
// la carte (contrairement au `citoyenGeoloc` silencieux utilisé ailleurs
// dans app/recherche/page.tsx pour le calcul de distance) — seule une
// permission déjà accordée est détectée silencieusement via la Permissions
// API (dégrade proprement si absente, ex. Safari), toute nouvelle demande
// passe obligatoirement par un clic explicite sur le bouton "Ma position",
// conformément au brief.
type PositionUtilisateur = { lat: number; lng: number; accuracy: number };
type StatutLocalisation = 'idle' | 'recherche' | 'refuse' | 'indisponible';

function useMaPosition() {
  const [position, setPosition] = useState<PositionUtilisateur | null>(null);
  const [statut, setStatut] = useState<StatutLocalisation>('idle');
  const watchId = useRef<number | null>(null);

  const demarrerSuivi = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setStatut('indisponible'); return; }
    setStatut('recherche');
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setStatut('idle');
      },
      err => { setStatut(err.code === err.PERMISSION_DENIED ? 'refuse' : 'indisponible'); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(status => { if (status.state === 'granted') demarrerSuivi(); })
      .catch(() => {});
  }, [demarrerSuivi]);

  useEffect(() => () => { if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current); }, []);

  return { position, statut, demarrerSuivi };
}

function buildUserIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:40px;height:40px;">
        <div class="yelen-pulse" style="position:absolute;inset:-14px;border-radius:50%;background:rgba(245,166,35,0.35);"></div>
        <div style="position:relative;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${GOLD},#C8940A);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080812" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function UserLocationMarker({ position }: { position: PositionUtilisateur | null }) {
  if (!position) return null;
  return (
    <>
      {position.accuracy > 0 && (
        <Circle center={[position.lat, position.lng]} radius={position.accuracy} pathOptions={{ color: GOLD, weight: 1, opacity: 0.35, fillColor: GOLD, fillOpacity: 0.08 }}/>
      )}
      <Marker position={[position.lat, position.lng]} icon={buildUserIcon()} zIndexOffset={800} interactive={false}/>
    </>
  );
}

// Bouton flottant "Ma position" — recentrage animé (flyTo, jamais un saut
// brusque de zoom), zoom confortable (14, cohérent avec le niveau déjà
// utilisé pour centrer sur un établissement sélectionné ailleurs dans ce
// fichier). Gère les 3 cas du brief : permission déjà accordée (recentre
// direct), pas encore accordée (le clic déclenche la demande native, puis
// recentre dès la première position reçue), refusée/indisponible (message
// explicatif — pas de lien direct vers les réglages système, un site web
// ne peut pas ouvrir les réglages iOS/Android, honnêteté sur cette limite
// plutôt qu'un faux bouton "Ouvrir les réglages").
function BoutonMaPosition({ position, statut, demarrerSuivi }: {
  position: PositionUtilisateur | null; statut: StatutLocalisation; demarrerSuivi: () => void;
}) {
  const map = useMap();
  const [message, setMessage] = useState<string | null>(null);
  const recentrageEnAttente = useRef(false);

  useEffect(() => {
    if (recentrageEnAttente.current && position) {
      recentrageEnAttente.current = false;
      map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
    }
  }, [position, map]);

  // Message d'erreur synchronisé sur un signal externe (statut de
  // permission renvoyé par l'API navigateur), pas une valeur dérivable
  // pendant le rendu — même justification déjà établie ailleurs dans ce
  // projet pour ce type d'effet (app/recherche/page.tsx, CarteSheet).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (statut === 'refuse') setMessage("Localisation refusée — autorisez-la pour votre navigateur afin d'utiliser cette fonctionnalité.");
    else if (statut === 'indisponible') setMessage("Localisation indisponible — vérifiez que les services de localisation sont activés sur votre appareil.");
    if (statut === 'refuse' || statut === 'indisponible') {
      const t = setTimeout(() => setMessage(null), 4500);
      return () => clearTimeout(t);
    }
  }, [statut]);

  function onClick() {
    if (position) {
      map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
      return;
    }
    recentrageEnAttente.current = true;
    demarrerSuivi();
  }

  return (
    <>
      {/* En haut, même ligne que "Rechercher dans cette zone" (top:14px,
          app/recherche/page.tsx) — retour Bryan 09/08/2026 : en bas, le
          sheet DoorDash (même palier "mini") finissait par le recouvrir. */}
      {message && (
        <div style={{ position: 'absolute', right: '14px', top: '68px', zIndex: 900, maxWidth: '220px', background: '#0D0D1A', color: '#fff', fontSize: '11.5px', fontWeight: 600, lineHeight: 1.4, padding: '10px 12px', borderRadius: '12px', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
          {message}
        </div>
      )}
      <button
        onClick={onClick}
        aria-label="Ma position"
        className="tap"
        style={{ position: 'absolute', right: '14px', top: '14px', zIndex: 900, width: '44px', height: '44px', borderRadius: '50%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        {statut === 'recherche' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'yelenSpin 0.9s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={position ? GOLD : '#111111'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L4 21l8-4 8 4z"/></svg>
        )}
      </button>
    </>
  );
}

export default function CarteMap({ institutions, selectedId = null, onSelect, onZoneChange }: {
  institutions: Institution[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onZoneChange?: (ids: string[], parUtilisateur: boolean) => void
  // Position réelle du citoyen (app/recherche/RechercheInner.tsx, déjà
  // récupérée pour le calcul de distance des fiches) — utilisée ici pour le
  // cadrage initial, voir MapPositioning. Distincte de useMaPosition
  // ci-dessus (marqueur "Ma position" + recentrage manuel), qui ne demande
  // jamais la permission automatiquement.
  citoyenGeoloc?: { lat: number; lng: number } | null
}) {
  const [mounted, setMounted] = useState(false)
  // Détection "monté côté client" pour éviter un rendu SSR de Leaflet (API DOM
  // indisponible côté serveur) — ne peut pas être calculé pendant le rendu,
  // c'est justement ce que cet effet détecte.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])
  const { position: maPosition, statut: statutLocalisation, demarrerSuivi } = useMaPosition()
  if (!mounted) return null

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <style>{`
        @keyframes yelenPulse{0%{transform:scale(0.6);opacity:0.6}100%{transform:scale(1.4);opacity:0}}
        .yelen-pulse{animation:yelenPulse 2s ease-out infinite}
        @keyframes yelenSpin{to{transform:rotate(360deg)}}
      `}</style>
      <MapContainer center={[9.6412, -13.5784]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* Contour doré Yelen — forme EXACTE de la Guinée (décision CEO
            06/08/2026, mission carte citoyen), tracé depuis le vrai GeoJSON
            officiel (geoBoundaries ADM0, fourni par Bryan) en coordonnées
            GPS réelles — un vrai calque géoréférencé Leaflet, pas un SVG
            statique (à la différence de la carte du dashboard institution,
            qui n'a que sa propre forme statique, restée en référence
            visuelle inchangée). Jamais interactif, ne bloque aucun clic
            sur les repères/la carte en dessous. */}
        <Polygon positions={GUINEE_CONTOUR_LATLNG} pathOptions={{ color: GOLD, weight: 2, fillOpacity: 0, interactive: false }}/>
        <InvalidateOnMount />
        <MapPositioning institutions={institutions} selectedId={selectedId} />
        <ZoneWatcher institutions={institutions} onZoneChange={onZoneChange} />
        {institutions.map(inst => (
          <Marker
            key={inst.id}
            position={[inst.latitude, inst.longitude]}
            icon={buildIcon(inst, inst.id === selectedId)}
            eventHandlers={{ click: () => onSelect?.(inst.id) }}
          />
        ))}
        <UserLocationMarker position={maPosition}/>
        <BoutonMaPosition position={maPosition} statut={statutLocalisation} demarrerSuivi={demarrerSuivi}/>
      </MapContainer>
    </div>
  )
}
