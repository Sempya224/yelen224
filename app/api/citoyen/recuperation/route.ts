import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/
const CIN_ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_CIN_SIZE = 10 * 1024 * 1024

// Pas de session possible ici par définition (c'est justement le problème
// à résoudre) — seule protection anti-abus : rate limit IP, comme
// lookup/verify/register. Volontairement strict (peu de demandes légitimes
// par IP en temps normal).
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez dans une heure, ou contactez le support.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Corps de requête invalide', code: 'BAD_REQUEST' }, { status: 400 })

    const typeRaw = form.get('type')
    const type = typeRaw === 'totp' ? 'totp' : 'numero'
    const ancienPhone = form.get('ancien_phone')
    // Cas "2FA perdue" : le numéro ne change pas — le champ nouveau_phone
    // n'a pas de sens pour le citoyen, on le fait égal à l'ancien.
    const nouveauPhone = type === 'totp' ? ancienPhone : form.get('nouveau_phone')
    const prenom = form.get('prenom')
    const nom = form.get('nom')
    const file = form.get('file')

    if (typeof ancienPhone !== 'string' || !PHONE_REGEX.test(ancienPhone)) {
      return NextResponse.json({ error: 'Numéro invalide', code: 'INVALID_FORMAT' }, { status: 400 })
    }
    if (typeof nouveauPhone !== 'string' || !PHONE_REGEX.test(nouveauPhone)) {
      return NextResponse.json({ error: 'Nouveau numéro invalide', code: 'INVALID_FORMAT' }, { status: 400 })
    }
    if (type === 'numero' && ancienPhone === nouveauPhone) {
      return NextResponse.json({ error: "Le nouveau numéro doit être différent de l'ancien", code: 'SAME_PHONE' }, { status: 400 })
    }
    if (typeof prenom !== 'string' || !prenom.trim() || typeof nom !== 'string' || !nom.trim()) {
      return NextResponse.json({ error: 'Nom et prénom requis', code: 'MISSING_FIELDS' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Pièce d'identité requise", code: 'MISSING_FILE' }, { status: 400 })
    }
    if (!CIN_ACCEPTED_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Format non accepté (PDF, JPG, PNG uniquement)', code: 'INVALID_FORMAT' }, { status: 400 })
    }
    if (file.size > MAX_CIN_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (10 Mo max)', code: 'TOO_LARGE' }, { status: 400 })
    }

    // Rapprochement automatique avec le compte existant sur l'ancien numéro
    // — reste null si introuvable (numéro mal saisi, compte déjà modifié
    // entre-temps, etc.) : un admin résout ce cas manuellement, jamais
    // bloquant pour la création de la demande elle-même.
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', ancienPhone)
      .maybeSingle()

    const { data: demande, error: insertError } = await supabaseAdmin
      .from('citoyen_demandes_recuperation')
      .insert({
        type,
        ancien_phone: ancienPhone,
        nouveau_phone: nouveauPhone,
        prenom: prenom.trim(),
        nom: nom.trim(),
        user_id: existingUser?.id ?? null,
      })
      .select('id')
      .single()

    if (insertError || !demande) {
      console.error('[CITOYEN RECUPERATION INSERT ERROR]', insertError)
      return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
    }

    const ext = file.name.split('.').pop() || 'bin'
    const path = `recuperation/${demande.id}/${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabaseAdmin.storage.from('documents-citoyens').upload(path, buffer, { contentType: file.type })
    if (upErr) {
      console.error('[CITOYEN RECUPERATION UPLOAD ERROR]', upErr)
      return NextResponse.json({ error: 'Erreur lors du dépôt du document', code: 'UPLOAD_ERROR' }, { status: 500 })
    }

    await supabaseAdmin.from('citoyen_demandes_recuperation').update({ cin_document_url: path }).eq('id', demande.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CITOYEN RECUPERATION ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
