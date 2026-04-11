import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin',
    audience: 'yelen224-admin-dashboard',
  })
  return payload
}

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    if (!q || q.length < 2) {
      return NextResponse.json([])
    }

    const [instRes, usersRes] = await Promise.allSettled([
      supabaseAdmin
        .from('institutions')
        .select('id, name, category, ville')
        .ilike('name', `%${q}%`)
        .limit(5),

      supabaseAdmin
        .from('users')
        .select('id, nom, prenom, phone')
        .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(5),
    ])

    const results: { type: string, label: string, id: string }[] = []

    const instData = instRes.status === 'fulfilled' ? instRes.value.data || [] : []
    for (const i of instData) {
      results.push({
        type: 'institutions',
        label: `${i.name} — ${i.category} · ${i.ville}`,
        id: i.id,
      })
    }

    const usersData = usersRes.status === 'fulfilled' ? usersRes.value.data || [] : []
    for (const u of usersData) {
      results.push({
        type: 'citoyens',
        label: `${u.prenom || ''} ${u.nom || ''} — ${u.phone || ''}`.trim(),
        id: u.id,
      })
    }

    return NextResponse.json(results)

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}