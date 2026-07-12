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

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyToken(request)

    const body = await request.json()
    const { cible, message } = body

    if (!cible || !message?.trim()) {
      return NextResponse.json(
        { error: 'Cible et message requis' },
        { status: 400 }
      )
    }

    if (message.length > 500) {
      return NextResponse.json(
        { error: 'Message trop long (max 500 caractères)' },
        { status: 400 }
      )
    }

    // Récupérer les destinataires selon la cible
    let destinataires: string[] = []

    if (cible === 'citoyens') {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
      destinataires = (data || []).map(u => u.id)
    } else if (cible === 'institutions') {
      const { data } = await supabaseAdmin
        .from('institutions')
        .select('user_id')
        .eq('statut', 'validee')
      destinataires = (data || []).map(i => i.user_id).filter(Boolean)
    }

    if (destinataires.length === 0) {
      return NextResponse.json(
        { error: 'Aucun destinataire trouvé' },
        { status: 404 }
      )
    }

    // Insérer les notifications en batch
    const notifications = destinataires.map(userId => ({
      user_id: userId,
      titre: 'Message de Yelen224',
      message: message.trim(),
      type: 'admin_broadcast',
      lu: false,
    }))

    // Insérer par batch de 100
    const batchSize = 100
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize)
      await supabaseAdmin.from('notifications').insert(batch)
    }

    // Logger l'action
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'BROADCAST_NOTIFICATION',
      details: {
        cible,
        message: message.trim(),
        destinataires_count: destinataires.length,
      },
    })

    return NextResponse.json({
      success: true,
      destinataires_count: destinataires.length,
    })

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}