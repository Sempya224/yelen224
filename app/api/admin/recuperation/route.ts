import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const DELAI_ACTIVATION_MS = 48 * 60 * 60 * 1000

// Génère une URL signée temporaire pour la pièce d'identité — le bucket
// "documents-citoyens" est privé (pas de policy publique), un admin ne peut
// pas simplement construire l'URL lui-même.
async function urlSigneeDocument(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabaseAdmin.storage.from('documents-citoyens').createSignedUrl(path, 60 * 10)
  return data?.signedUrl ?? null
}

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'recuperation.manage')

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || 'en_attente'

    let query = supabaseAdmin
      .from('citoyen_demandes_recuperation')
      .select('id, type, ancien_phone, nouveau_phone, prenom, nom, cin_document_url, user_id, statut, date_approbation, date_activation_prevue, annule_le, notes_admin, created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (statut !== 'tous') query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) throw error

    const demandes = await Promise.all((data ?? []).map(async d => ({
      ...d,
      document_url: await urlSigneeDocument(d.cin_document_url),
      compte_trouve: !!d.user_id,
    })))

    return NextResponse.json(demandes)
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

// action: "approuver" (démarre le délai 48h) | "rejeter" | "forcer"
// (applique immédiatement, échappatoire admin toujours disponible) |
// "annuler" (le citoyen a joint le support sur l'ancien numéro, ou erreur
// de traitement) | "associer" (rattache manuellement un user_id quand le
// rapprochement automatique par ancien_phone a échoué).
export async function PATCH(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request, 'recuperation.manage')

    const body = await request.json().catch(() => null)
    const id = body?.id
    const action = body?.action
    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }

    const { data: demande } = await supabaseAdmin
      .from('citoyen_demandes_recuperation')
      .select('id, type, user_id, nouveau_phone, statut')
      .eq('id', id)
      .maybeSingle()
    if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

    let update: Record<string, unknown> = {}
    let logAction = ''

    if (action === 'approuver') {
      update = {
        statut: 'approuve',
        date_approbation: new Date().toISOString(),
        date_activation_prevue: new Date(Date.now() + DELAI_ACTIVATION_MS).toISOString(),
        traite_par_admin_id: admin.adminId as string,
      }
      logAction = 'RECUPERATION_APPROUVEE'
    } else if (action === 'rejeter') {
      const notes = typeof body?.notes === 'string' ? body.notes : null
      update = { statut: 'refuse', traite_par_admin_id: admin.adminId as string, notes_admin: notes }
      logAction = 'RECUPERATION_REJETEE'
    } else if (action === 'annuler') {
      update = { statut: 'annule', annule_le: new Date().toISOString(), traite_par_admin_id: admin.adminId as string }
      logAction = 'RECUPERATION_ANNULEE'
    } else if (action === 'associer') {
      const userId = body?.userId
      if (typeof userId !== 'string') return NextResponse.json({ error: 'userId requis' }, { status: 400 })
      update = { user_id: userId, traite_par_admin_id: admin.adminId as string }
      logAction = 'RECUPERATION_ASSOCIEE'
    } else if (action === 'forcer') {
      // Échappatoire admin — toujours disponible, quel que soit l'état
      // (retour Bryan 25/07/2026 : "jamais bloquer sans chemin pour les
      // admin"). Applique immédiatement, sans attendre les 48h, y compris
      // si le rapprochement automatique a échoué (dans ce cas "associer"
      // doit être appelé avant, ou userId fourni ici). type='totp' :
      // réinitialise la 2FA au lieu de changer le numéro — même levier que
      // api/citoyen/securite/totp/disable, mais déclenché par l'admin
      // après vérification CIN.
      const userId = (body?.userId as string | undefined) ?? demande.user_id
      if (!userId) return NextResponse.json({ error: "Aucun compte associé — utilisez d'abord l'action associer" }, { status: 400 })
      if (demande.type === 'totp') {
        const { error: totpErr } = await supabaseAdmin.from('users').update({ totp_secret: null, totp_enabled: false, totp_backup_codes: null }).eq('id', userId)
        if (totpErr) throw totpErr
      } else {
        const { error: phoneErr } = await supabaseAdmin.from('users').update({ phone: demande.nouveau_phone }).eq('id', userId)
        if (phoneErr) throw phoneErr
      }
      update = { statut: 'applique', user_id: userId, traite_par_admin_id: admin.adminId as string }
      logAction = 'RECUPERATION_FORCEE'
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('citoyen_demandes_recuperation').update(update).eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: logAction,
      cible_table: 'citoyen_demandes_recuperation',
      cible_id: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AdminAuthError) return adminAuthErrorResponse(error)
    console.error('[ADMIN RECUPERATION PATCH ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
