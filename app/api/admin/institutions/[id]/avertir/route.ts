import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
  })
  if (!['super_admin', 'moderateur', 'admin'].includes(payload.role as string)) throw new Error('FORBIDDEN')
  return payload
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAdmin(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Incrémenter le compteur d'avertissements
    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('avertissements, name')
      .eq('id', id)
      .single()

    const nouveauNb = (inst?.avertissements || 0) + 1
    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ avertissements: nouveauNb })
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'AVERTIR_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { raison: body.raison || 'Non spécifiée', avertissements_total: nouveauNb },
    })

    return NextResponse.json({ ok: true, avertissements: nouveauNb })
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
