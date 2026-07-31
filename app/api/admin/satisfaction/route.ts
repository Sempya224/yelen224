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

const SCORES: Record<string, number> = {
  accord_total: 5, accord: 4, neutre: 3, desaccord: 2, desaccord_total: 1,
}

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '0')

    // Résumé calculé sur TOUTES les réponses (pas seulement la page en
    // cours) — comptes par valeur + moyenne sur 5.
    const { data: allReponses, error: errAll } = await supabaseAdmin
      .from('enquete_satisfaction')
      .select('reponse')
    if (errAll) throw errAll

    const comptes = { accord_total: 0, accord: 0, neutre: 0, desaccord: 0, desaccord_total: 0 }
    let sommeScores = 0
    for (const r of allReponses ?? []) {
      const key = r.reponse as keyof typeof comptes
      if (key in comptes) comptes[key] += 1
      sommeScores += SCORES[r.reponse] ?? 0
    }
    const total = (allReponses ?? []).length
    const moyenne = total > 0 ? sommeScores / total : 0

    // Liste paginée — uniquement les réponses avec un commentaire libre
    // (les réponses sans commentaire comptent déjà dans le résumé ci-dessus).
    const { data, error } = await supabaseAdmin
      .from('enquete_satisfaction')
      .select('id, citoyen_id, reponse, commentaire, institution_id, created_at')
      .not('commentaire', 'is', null)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)
    if (error) throw error

    const institutionIds = [...new Set((data ?? []).map(f => f.institution_id).filter((id): id is string => !!id))]
    const { data: institutions } = institutionIds.length
      ? await supabaseAdmin.from('institutions').select('id, name').in('id', institutionIds)
      : { data: [] as { id: string; name: string }[] }
    const nomMap = new Map((institutions ?? []).map(i => [i.id, i.name]))

    const items = (data ?? []).map(f => ({
      ...f,
      institution_nom: f.institution_id ? (nomMap.get(f.institution_id) ?? 'Institution inconnue') : null,
    }))

    return NextResponse.json({ items, resume: { total, moyenne, comptes } })

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}
