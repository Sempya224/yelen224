import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'search.read')

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

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}