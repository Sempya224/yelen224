'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const Map = dynamic(() => import('@/components/CarteMap'), { ssr: false })

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
  disponibilites: string[] | null
}

// Route autonome, non reliée depuis la navigation (superseded by la vue
// Carte intégrée à /recherche, qui porte le carrousel de résultats) —
// conservée fonctionnelle avec une interaction minimale plutôt que
// silencieusement cassée par le passage de CarteMap à un composant
// contrôlé (sélection désormais pilotée par le parent, plus de bottom
// sheet interne).
export default function CartePage() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('institutions')
      .select('id, name, ville, quartier, adresse, latitude, longitude, phone, logo, moyenne_avis, nb_avis, badge_verifie, category, disponibilites')
      .not('latitude', 'is', null)
      .then(({ data }) => {
        if (data) setInstitutions(data)
      })
  }, [])

  const selected = institutions.find(i => i.id === selectedId) || null

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <Map institutions={institutions} selectedId={selectedId} onSelect={setSelectedId} />
      {selected && (
        <div style={{ position: 'absolute', left: '12px', right: '12px', bottom: '12px', zIndex: 1000, background: '#fff', borderRadius: '16px', padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '13px', color: '#111' }}>{selected.name}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{selected.ville}{selected.quartier ? `, ${selected.quartier}` : ''}</div>
          </div>
          {selected.phone && <a href={`tel:${selected.phone}`} style={{ padding: '8px 12px', background: '#F5A623', borderRadius: '10px', color: '#080812', fontWeight: 800, fontSize: '11px', textDecoration: 'none' }}>Appeler</a>}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', background: '#111', borderRadius: '10px', color: '#fff', fontWeight: 800, fontSize: '11px', textDecoration: 'none' }}>Itinéraire</a>
        </div>
      )}
    </div>
  )
}