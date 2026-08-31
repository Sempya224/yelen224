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
    await authorizeAdmin(request, 'citoyens.read')

    const { searchParams } = new URL(request.url)
    const limit  = parseInt(searchParams.get('limit') || '25')
    const page   = parseInt(searchParams.get('page')  || '0')
    const search = searchParams.get('search') || ''

    let query = supabaseAdmin
      .from('users')
      .select('id, nom, prenom, phone, created_at')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (search) {
      query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data || [])

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
