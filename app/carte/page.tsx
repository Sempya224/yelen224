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
  disponibilites: any
}

export default function CartePage() {
  const [institutions, setInstitutions] = useState<Institution[]>([])

  useEffect(() => {
    supabase
      .from('institutions')
      .select('id, name, ville, quartier, adresse, latitude, longitude, phone, logo, moyenne_avis, nb_avis, badge_verifie, category, disponibilites')
      .not('latitude', 'is', null)
      .then(({ data }) => {
        if (data) setInstitutions(data)
      })
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <Map institutions={institutions} />
    </div>
  )
}