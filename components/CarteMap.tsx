'use client'

import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect } from 'react'

type Institution = {
  id: string
  name: string
  ville: string
  quartier: string | null
  adresse: string | null
  latitude: number
  longitude: number
  phone: string | null
  logo: string | null
  moyenne_avis: number | null
  nb_avis: number | null
  badge_verifie: boolean
  category: string | null
  disponibilites: any
}

const buildIcon = (name: string, verified: boolean) => L.divIcon({
  className: '',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="background:#F5A623;color:#fff;font-size:8px;font-weight:800;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);line-height:1.4;">
        ${verified ? '✓ ' : ''}Prestataire Yelen224
      </div>
      <div style="width:34px;height:34px;background:${verified ? '#F5A623' : '#fff'};border:3px solid ${verified ? '#fff' : '#F5A623'};border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:15px;">🏥</div>
      <div style="background:rgba(255,255,255,0.92);color:#1a1a1a;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);max-width:120px;overflow:hidden;text-overflow:ellipsis;">
        ${name}
      </div>
    </div>
  `,
  iconSize: [130, 72],
  iconAnchor: [65, 38],
  popupAnchor: [0, -72],
})

export default function CarteMap({ institutions }: { institutions: Institution[] }) {
  const [mounted, setMounted] = useState(false)
  const [selected, setSelected] = useState<Institution | null>(null)
  const [showHoraires, setShowHoraires] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  const getItineraire = (inst: Institution) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${inst.latitude},${inst.longitude}`, '_blank')
  }

  const renderHoraires = (dispo: any) => {
    if (!dispo) return <p style={{ color: '#999', fontSize: '12px' }}>Aucun horaire disponible</p>
    if (typeof dispo === 'string') return <p style={{ fontSize: '12px' }}>{dispo}</p>
    return (
      <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
        {Object.entries(dispo).map(([jour, heure]) => {
          const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' })
          const isToday = jour.toLowerCase() === today.toLowerCase()
          return (
            <div key={jour} style={{
              display: 'flex', justifyContent: 'space-between',
              fontWeight: isToday ? '800' : '400',
              color: isToday ? '#F5A623' : '#555',
              padding: '2px 0',
              borderBottom: '1px solid #f0f0f0',
            }}>
              <span style={{ textTransform: 'capitalize' }}>{jour}</span>
              <span>{String(heure)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>

      {/* Branding */}
      <div style={{
        position: 'absolute',
        bottom: selected ? '340px' : '30px',
        left: '10px',
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        color: '#F5A623',
        fontSize: '10px',
        fontWeight: '700',
        padding: '4px 10px',
        borderRadius: '20px',
        transition: 'bottom 0.3s ease',
      }}>
        YELEN224 • Powered by Sempya224
      </div>

      <MapContainer
        center={[9.5370, -13.6773]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {institutions.map((inst) => (
          <Marker
            key={inst.id}
            position={[inst.latitude, inst.longitude]}
            icon={buildIcon(inst.name, inst.badge_verifie)}
            eventHandlers={{ click: () => { setSelected(inst); setShowHoraires(false) } }}
          />
        ))}
      </MapContainer>

      {/* Bottom Sheet */}
      {selected && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          zIndex: 1000,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
          padding: '20px',
          maxHeight: '380px',
          overflowY: 'auto',
        }}>

          <div style={{ width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            {selected.logo ? (
              <img src={selected.logo} alt={selected.name} style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', border: '2px solid #F5A623' }} />
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FFF3DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', border: '2px solid #F5A623' }}>🏥</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: '800', fontSize: '16px', color: '#1a1a1a' }}>{selected.name}</span>
                {selected.badge_verifie && (
                  <span style={{ background: '#F5A623', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px' }}>✓ VÉRIFIÉ</span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{selected.category} • {selected.quartier ?? selected.ville}</div>
              {selected.moyenne_avis != null && selected.moyenne_avis > 0 && (
                <div style={{ fontSize: '12px', color: '#F5A623', marginTop: '2px' }}>
                  ⭐ {Number(selected.moyenne_avis).toFixed(1)} ({selected.nb_avis} avis)
                </div>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>

          {/* Adresse */}
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
            📍 {selected.adresse ?? ''}{selected.quartier ? `, ${selected.quartier}` : ''}, {selected.ville}
          </div>

          {/* Téléphone */}
          {selected.phone && (
            <div style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
              📞 <a href={`tel:${selected.phone}`} style={{ color: '#F5A623', fontWeight: '600' }}>{selected.phone}</a>
            </div>
          )}

          {/* Horaires toggle */}
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => setShowHoraires(!showHoraires)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#F5A623', fontWeight: '700', padding: 0 }}
            >
              🕐 {showHoraires ? 'Masquer les horaires ▲' : 'Voir les horaires ▼'}
            </button>
            {showHoraires && (
              <div style={{ marginTop: '8px', background: '#fafafa', borderRadius: '8px', padding: '10px' }}>
                {renderHoraires(selected.disponibilites)}
              </div>
            )}
          </div>

          {/* Itinéraire */}
          <button
            onClick={() => getItineraire(selected)}
            style={{ width: '100%', background: '#F5A623', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: '800', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            🧭 Itinéraire
          </button>
        </div>
      )}
    </div>
  )
}