'use client'

// Documents légaux — accès minimal pour l'espace admin (chantier Légal &
// Confidentialité, Lot 3, Surface 1, 23/09/2026). Page volontairement
// statique : pas de CGP (hors périmètre admin), pas de statut/consentement,
// pas de contrôle personnel — seulement les 4 documents publics pertinents.
// Mêmes tokens D que app/admin/security/page.tsx (pas de module de thème
// admin partagé pour l'instant). Navigation en place via next/link (pas de
// target="_blank") — retour Bryan 23/09/2026 : ce sont des documents
// internes Yelen, pas une sortie externe, le bouton Retour suffit.
// Correction 23/09/2026 : LINKS dérivé de lib/legalNav.ts (groupe
// "Documents généraux" uniquement, exclusion CGP toujours volontaire) au
// lieu d'une liste propre qui pouvait diverger silencieusement.
import Link from 'next/link'
import { D } from '@/app/admin/adminTheme'
import { LEGAL_NAV_GROUPS } from '@/lib/legalNav'

const LINKS = LEGAL_NAV_GROUPS.find(g => g.titre === "Documents généraux")?.items ?? []

export default function AdminLegalPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '640px' }}>
      <h1 style={{ color: D.text, fontSize: '15px', fontWeight: '700', margin: '0 0 4px' }}>Documents légaux</h1>
      <p style={{ color: D.textSub, fontSize: '12.5px', margin: '0 0 16px', lineHeight: 1.5 }}>Les documents qui encadrent l&apos;utilisation de la plateforme Yelen224.</p>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', overflow: 'hidden' }}>
        {LINKS.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', borderBottom: i < LINKS.length - 1 ? `1px solid ${D.border}` : 'none', textDecoration: 'none' }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: D.textSub, flexShrink: 0 }}/>
            <span style={{ flex: 1, color: D.text, fontSize: '13px', fontWeight: '600' }}>{item.label}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.textSub} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
