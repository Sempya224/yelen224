import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, verifyRecentReauth, type AdminPermission } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Un seul endpoint sert 4 exports de sensibilité très différente — décision
// CEO 08/08/2026 (audit sécurité admin) : scindé en permission par type
// plutôt qu'un unique export.pii global, pour ne pas casser la page
// Paiements (nav = super_admin+moderateur+admin) qui appelle ce endpoint
// avec type=paiements.
const PERMISSION_PAR_TYPE: Record<string, AdminPermission> = {
  citoyens: 'export.citoyens',
  institutions: 'export.institutions',
  rdv: 'export.rdv',
  paiements: 'export.paiements',
}

function toCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return ''
  const headers = Object.keys(data[0])
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return str.includes(',') || str.includes('\n') || str.includes('"')
        ? `"${str}"`
        : str
    }).join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (!type) {
      return NextResponse.json({ error: 'Type requis' }, { status: 400 })
    }
    const permission: AdminPermission | undefined = PERMISSION_PAR_TYPE[type]
    if (!permission) {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }

    const admin = await authorizeAdmin(request, permission)
    // Réauthentification récente obligatoire (Mission Hardening Admin,
    // point 5, 30/08/2026) — "exporter des données sensibles" est
    // explicitement listé dans le brief, quel que soit le type exporté.
    await verifyRecentReauth(admin)

    let data: Record<string, unknown>[] = []
    let filename = ''

    switch (type) {
      case 'citoyens': {
        const { data: rows } = await supabaseAdmin
          .from('users')
          .select('id, nom, prenom, phone, created_at')
          .order('created_at', { ascending: false })
        data = (rows || []).map(r => ({
          ID: r.id,
          Nom: r.nom || '',
          Prenom: r.prenom || '',
          Telephone: r.phone || '',
          Inscription: new Date(r.created_at).toLocaleDateString('fr-FR'),
        }))
        filename = 'citoyens'
        break
      }

      case 'institutions': {
        const { data: rows } = await supabaseAdmin
          .from('institutions')
          .select('id, name, category, ville, statut, email, phone, plan, badge_verifie, avertissements, created_at')
          .order('created_at', { ascending: false })
        data = (rows || []).map(r => ({
          ID: r.id,
          Nom: r.name || '',
          Categorie: r.category || '',
          Ville: r.ville || '',
          Statut: r.statut || '',
          Plan: r.plan || '',
          Badge: r.badge_verifie ? 'Oui' : 'Non',
          Avertissements: r.avertissements || 0,
          Email: r.email || '',
          Telephone: r.phone || '',
          Inscription: new Date(r.created_at).toLocaleDateString('fr-FR'),
        }))
        filename = 'institutions'
        break
      }

      case 'rdv': {
        const { data: rows } = await supabaseAdmin
          .from('rdv')
          .select('id, statut, created_at, date_rdv, heure_rdv, institution_id, user_id')
          .order('created_at', { ascending: false })
        data = (rows || []).map(r => ({
          ID: r.id,
          Statut: r.statut || '',
          Date_RDV: r.date_rdv || '',
          Heure_RDV: r.heure_rdv || '',
          Institution_ID: r.institution_id || '',
          Citoyen_ID: r.user_id || '',
          Cree_le: new Date(r.created_at).toLocaleDateString('fr-FR'),
        }))
        filename = 'rdv'
        break
      }

      case 'paiements': {
        const { data: rows } = await supabaseAdmin
          .from('paiements')
          .select('id, montant, statut, created_at, institution_id, user_id')
          .order('created_at', { ascending: false })
        data = (rows || []).map(r => ({
          ID: r.id,
          Montant_GNF: r.montant || 0,
          Statut: r.statut || '',
          Institution_ID: r.institution_id || '',
          Citoyen_ID: r.user_id || '',
          Date: new Date(r.created_at).toLocaleDateString('fr-FR'),
        }))
        filename = 'paiements'
        break
      }

      default:
        return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }

    // Logger l'export
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'EXPORT_CSV',
      details: { type, count: data.length },
    })

    const csv = toCSV(data)
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="yelen224_${filename}_${date}.csv"`,
      },
    })

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}