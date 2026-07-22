import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

// Lot 3 (chantier "Messagerie" 19/07/2026) — boîte de réception du support
// Yelen : conversations messages_yelen_citoyen ET messages_yelen_institution
// (permanentes, jamais fermées), toutes institutions/citoyens confondus.
// Contrairement à documents-citoyen (lecture seule, responsabilité
// opérationnelle de l'institution), ici Yelen EST la partie prenante —
// cette route écrit réellement (POST) au nom de l'admin connecté.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard' })
  return payload
}

type Partie = 'citoyen' | 'institution'

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as Partie | null
    const id = searchParams.get('id')

    if (type && id) {
      const table = type === 'citoyen' ? 'messages_yelen_citoyen' : 'messages_yelen_institution'
      const idCol = type === 'citoyen' ? 'citoyen_id' : 'institution_id'
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('id,expediteur,contenu,image_url,type,lu,cree_le')
        .eq(idCol, id)
        .order('cree_le', { ascending: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabaseAdmin.from(table).update({ lu: true }).eq(idCol, id).neq('expediteur', 'yelen').eq('lu', false)

      return NextResponse.json({ messages: data ?? [] })
    }

    const [{ data: msgsCitoyen }, { data: msgsInstitution }] = await Promise.all([
      supabaseAdmin.from('messages_yelen_citoyen').select('citoyen_id,contenu,type,lu,cree_le,expediteur').order('cree_le', { ascending: true }),
      supabaseAdmin.from('messages_yelen_institution').select('institution_id,contenu,type,lu,cree_le,expediteur').order('cree_le', { ascending: true }),
    ])

    type Entree = { type: Partie; id: string; nom: string; dernier_message: string | null; dernier_message_type: string | null; dernier_message_at: string | null; non_lus: number }
    const parCitoyen = new Map<string, { contenu: string | null; type: string; cree_le: string }>()
    const nonLusCitoyen = new Map<string, number>()
    for (const m of msgsCitoyen ?? []) {
      parCitoyen.set(m.citoyen_id, { contenu: m.contenu, type: m.type ?? 'texte', cree_le: m.cree_le })
      if (m.expediteur !== 'yelen' && !m.lu) nonLusCitoyen.set(m.citoyen_id, (nonLusCitoyen.get(m.citoyen_id) ?? 0) + 1)
    }
    const parInstitution = new Map<string, { contenu: string | null; type: string; cree_le: string }>()
    const nonLusInstitution = new Map<string, number>()
    for (const m of msgsInstitution ?? []) {
      parInstitution.set(m.institution_id, { contenu: m.contenu, type: m.type ?? 'texte', cree_le: m.cree_le })
      if (m.expediteur !== 'yelen' && !m.lu) nonLusInstitution.set(m.institution_id, (nonLusInstitution.get(m.institution_id) ?? 0) + 1)
    }

    const citoyenIds = [...parCitoyen.keys()]
    const institutionIds = [...parInstitution.keys()]
    const [{ data: users }, { data: institutions }] = await Promise.all([
      citoyenIds.length ? supabaseAdmin.from('users').select('id,nom,prenom,phone').in('id', citoyenIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] }),
      institutionIds.length ? supabaseAdmin.from('institutions').select('id,name').in('id', institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const uMap = new Map((users ?? []).map(u => [u.id, [u.prenom, u.nom].filter(Boolean).join(' ') || u.phone || 'Citoyen']))
    const iMap = new Map((institutions ?? []).map(i => [i.id, i.name]))

    const entrees: Entree[] = [
      ...citoyenIds.map(id => ({
        type: 'citoyen' as const, id, nom: uMap.get(id) ?? 'Citoyen',
        dernier_message: parCitoyen.get(id)?.contenu ?? null, dernier_message_type: parCitoyen.get(id)?.type ?? null,
        dernier_message_at: parCitoyen.get(id)?.cree_le ?? null, non_lus: nonLusCitoyen.get(id) ?? 0,
      })),
      ...institutionIds.map(id => ({
        type: 'institution' as const, id, nom: iMap.get(id) ?? 'Institution',
        dernier_message: parInstitution.get(id)?.contenu ?? null, dernier_message_type: parInstitution.get(id)?.type ?? null,
        dernier_message_at: parInstitution.get(id)?.cree_le ?? null, non_lus: nonLusInstitution.get(id) ?? 0,
      })),
    ].sort((a, b) => new Date(b.dernier_message_at ?? 0).getTime() - new Date(a.dernier_message_at ?? 0).getTime())

    return NextResponse.json({ conversations: entrees, total_non_lus: entrees.reduce((s, e) => s + e.non_lus, 0) })
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await verifyToken(request)
    const adminId = payload.adminId as string

    const body = await request.json().catch(() => null)
    const type = body?.type as Partie
    const id = typeof body?.id === 'string' ? body.id : null
    const contenu = typeof body?.contenu === 'string' ? body.contenu.trim() : ''
    if ((type !== 'citoyen' && type !== 'institution') || !id || !contenu) {
      return NextResponse.json({ error: 'type, id et contenu requis' }, { status: 400 })
    }

    const table = type === 'citoyen' ? 'messages_yelen_citoyen' : 'messages_yelen_institution'
    const idCol = type === 'citoyen' ? 'citoyen_id' : 'institution_id'
    const { error } = await supabaseAdmin.from(table).insert({
      [idCol]: id, expediteur: 'yelen', admin_id: adminId, contenu, type: 'texte', lu: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}
