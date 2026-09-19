import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

// Lot C (chantier "Activités passées") — vue d'ensemble plateforme du
// flux documents citoyen (lecture seule) : Yelen doit pouvoir superviser
// ces échanges (pièce d'identité, factures...) en cas de litige signalé,
// sans pour autant créer/modifier une demande à la place d'une
// institution — ça reste leur responsabilité opérationnelle (cf. mention
// de sécurité affichée côté institution et citoyen).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'documents_citoyen.read')

    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download')
    if (download) {
      const { data: doc } = await supabaseAdmin.from('citoyen_documents').select('url').eq('id', download).maybeSingle()
      if (!doc?.url) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
      const { data: signed, error: signErr } = await supabaseAdmin.storage.from('documents-citoyens').createSignedUrl(doc.url, 60)
      if (signErr || !signed) return NextResponse.json({ error: signErr?.message || 'Erreur de génération d\'URL' }, { status: 500 })
      return NextResponse.json({ url: signed.signedUrl })
    }

    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '0')

    const { data, error } = await supabaseAdmin
      .from('citoyen_documents')
      .select('id,institution_id,citoyen_id,sens,type,label,statut,taille,created_at,traite_le')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)
    if (error) throw error

    const institutionIds = [...new Set((data ?? []).map(d => d.institution_id))]
    const citoyenIds = [...new Set((data ?? []).map(d => d.citoyen_id))]
    const [{ data: institutions }, { data: users }] = await Promise.all([
      institutionIds.length ? supabaseAdmin.from('institutions').select('id,name').in('id', institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      citoyenIds.length ? supabaseAdmin.from('users').select('id,nom,prenom,phone').in('id', citoyenIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] }),
    ])
    const instMap = new Map((institutions ?? []).map(i => [i.id, i.name]))
    const uMap = new Map((users ?? []).map(u => [u.id, [u.prenom, u.nom].filter(Boolean).join(' ') || u.phone || 'Citoyen']))

    const documents = (data ?? []).map(d => ({
      ...d,
      institution_nom: instMap.get(d.institution_id) ?? 'Institution inconnue',
      citoyen_nom: uMap.get(d.citoyen_id) ?? 'Citoyen',
    }))

    return NextResponse.json({ documents })
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
