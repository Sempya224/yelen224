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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyToken(request)
    const { id } = await params
    const body = await request.json()
    const { motif } = body

    if (!motif?.trim()) {
      return NextResponse.json(
        { error: 'Motif de refus requis' },
        { status: 400 }
      )
    }

    // Mettre à jour le statut
    const { error } = await supabaseAdmin
      .from('institutions')
      .update({
        statut: 'refuse',
        refus_motif: motif.trim(),
        refused_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    // Récupérer l'institution pour la notif
    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('nom, user_id')
      .eq('id', id)
      .single()

    // Notifier l'institution
    if (inst?.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: inst.user_id,
        titre: 'Demande refusée',
        message: `Votre demande d'inscription pour "${inst.nom}" a été refusée. Motif : ${motif.trim()}. Vous pouvez corriger et soumettre à nouveau.`,
        type: 'refus',
        lu: false,
      })
    }

    // Logger l'action
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REFUSER_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { nom: inst?.nom, motif: motif.trim() },
    })

    return NextResponse.json({ success: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}