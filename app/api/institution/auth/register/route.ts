import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

// ⚠️ DEV MODE — décision assumée de Bryan (voir CLAUDE.md /auth), pas une dette
// à corriger sans demande explicite.
const DEV_OTP = '123456'

const PHONE_REGEX = /^\+224\d{8,9}$/

const SECTEURS = ['sante', 'administratif', 'financier', 'juridique', 'beaute_bien_etre', 'commerce', 'artisanat', 'services_divers']
const STATUTS_JURIDIQUES = ['public', 'prive_formel', 'liberal', 'individuel_informel']

const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

function lockedMsRemaining(phone: string): number {
  const entry = failedAttempts.get(phone)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(phone: string) {
  const now = Date.now()
  const entry = failedAttempts.get(phone)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(phone, { count, lockedUntil })
}

function clearFailures(phone: string) {
  failedAttempts.delete(phone)
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const {
      phone, code, name, category, ville, email, website, description,
      responsable_prenom, responsable_nom, responsable_role,
      secteur, statut_juridique,
      gestion_actuelle, volume_rdv_estime, type_service_souhaite, dispositif_principal,
    } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'code requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!responsable_prenom || typeof responsable_prenom !== 'string' || !responsable_prenom.trim()) {
      return NextResponse.json(
        { error: 'Le prénom du responsable est requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!responsable_nom || typeof responsable_nom !== 'string' || !responsable_nom.trim()) {
      return NextResponse.json(
        { error: 'Le nom du responsable est requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: "Le nom de l'institution est requis", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!secteur || typeof secteur !== 'string' || !SECTEURS.includes(secteur)) {
      return NextResponse.json(
        { error: "Le secteur d'activité est requis", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!statut_juridique || typeof statut_juridique !== 'string' || !STATUTS_JURIDIQUES.includes(statut_juridique)) {
      return NextResponse.json(
        { error: 'Le statut juridique est requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!ville || typeof ville !== 'string' || !ville.trim()) {
      return NextResponse.json(
        { error: 'La ville est requise', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (lockedMsRemaining(phone) > 0) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' },
        { status: 429 }
      )
    }

    // Ne pas dupliquer une institution déjà enregistrée sur ce numéro
    const { data: existing } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED' },
        { status: 409 }
      )
    }

    // Revalidation complète du code OTP — ne fait jamais confiance à un état
    // "vérifié" déclaré par le client (voir /verify-otp appelé en amont côté UI).
    let verified = false

    if (code === DEV_OTP) {
      verified = true
    } else {
      const { data: otpRow } = await supabaseAdmin
        .from('institution_otp')
        .select('id')
        .eq('phone', phone)
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (otpRow) {
        await supabaseAdmin.from('institution_otp').delete().eq('id', otpRow.id)
        verified = true
      }
    }

    if (!verified) {
      registerFailure(phone)
      return NextResponse.json(
        { error: 'Code incorrect', code: 'INVALID_CODE' },
        { status: 401 }
      )
    }

    clearFailures(phone)

    // Création de l'institution — niveau_confiance non fourni : la colonne a
    // un défaut ('profil_basique') côté base, source unique de vérité.
    const { data: institution, error: insertError } = await supabaseAdmin
      .from('institutions')
      .insert({
        name: name.trim(),
        ...(typeof category === 'string' && category.trim() ? { category: category.trim() } : {}),
        secteur,
        statut_juridique,
        ville: ville.trim(),
        phone,
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        website: typeof website === 'string' && website.trim() ? website.trim() : null,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        badge_verifie: false,
        moyenne_avis: 0,
        nb_avis: 0,
      })
      .select('id, name')
      .single()

    if (insertError || !institution) {
      console.error('[INSTITUTION REGISTER INSERT ERROR]', insertError?.code, insertError?.message, insertError?.details, insertError?.hint)
      return NextResponse.json(
        { error: "Erreur lors de la création de l'institution", code: 'INSERT_ERROR' },
        { status: 500 }
      )
    }

    // Responsable — table dédiée institution_responsables (migration
    // 20260711000002), plus jamais institutions.responsable_*. Non bloquant :
    // l'institution existe déjà, on log sans faire échouer l'inscription.
    const { error: responsableError } = await supabaseAdmin.from('institution_responsables').insert({
      institution_id: institution.id,
      prenom: responsable_prenom.trim(),
      nom: responsable_nom.trim(),
      role: typeof responsable_role === 'string' && responsable_role.trim() ? responsable_role.trim() : null,
    })
    if (responsableError) {
      console.error('[INSTITUTION REGISTER RESPONSABLE INSERT ERROR]', responsableError.code, responsableError.message, responsableError.details, responsableError.hint)
    }

    // Fondation multi-comptes (migration 20260714000001) — chaque nouvelle
    // institution reçoit son membre Admin principal (se connecte toujours
    // par téléphone+OTP, pas par identifiant/PIN — colonnes nullable dédiées
    // à ce cas). Non bloquant : l'institution existe déjà à ce stade.
    const { data: membrePrincipal, error: membreError } = await supabaseAdmin
      .from('institution_membres')
      .insert({
        institution_id: institution.id,
        prenom: responsable_prenom.trim(),
        nom: responsable_nom.trim(),
        role: 'admin',
        compte_principal: true,
        doit_changer_pin: false,
      })
      .select('id, role')
      .single()
    if (membreError) {
      console.error('[INSTITUTION REGISTER MEMBRE PRINCIPAL INSERT ERROR]', membreError.code, membreError.message, membreError.details, membreError.hint)
    }

    // Sondage de personnalisation — entièrement optionnel, jamais bloquant :
    // l'institution existe déjà à ce stade, une erreur ici ne doit jamais faire
    // échouer l'inscription.
    const hasSurveyData = [gestion_actuelle, volume_rdv_estime, type_service_souhaite, dispositif_principal]
      .some((v) => typeof v === 'string' && v.trim())

    if (hasSurveyData) {
      const { error: surveyError } = await supabaseAdmin.from('institution_onboarding_survey').insert({
        institution_id: institution.id,
        gestion_actuelle: typeof gestion_actuelle === 'string' && gestion_actuelle.trim() ? gestion_actuelle.trim() : null,
        volume_rdv_estime: typeof volume_rdv_estime === 'string' && volume_rdv_estime.trim() ? volume_rdv_estime.trim() : null,
        type_service_souhaite: typeof type_service_souhaite === 'string' && type_service_souhaite.trim() ? type_service_souhaite.trim() : null,
        dispositif_principal: typeof dispositif_principal === 'string' && dispositif_principal.trim() ? dispositif_principal.trim() : null,
      })
      if (surveyError) {
        console.error('[INSTITUTION REGISTER SURVEY INSERT ERROR]', surveyError.code, surveyError.message, surveyError.details, surveyError.hint)
      }
    }

    // Établir la session — identique à /verify-otp en flux connexion
    const token = await new SignJWT({
      institutionId: institution.id,
      ...(membrePrincipal ? { membreId: membrePrincipal.id, role: membrePrincipal.role } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    await supabaseAdmin.from('institution_sessions').insert({
      institution_id: institution.id,
      phone,
      user_agent: request.headers.get('user-agent'),
      is_active: true,
    })

    const response = NextResponse.json({
      success: true,
      institution: { id: institution.id, name: institution.name },
    })

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('[INSTITUTION REGISTER ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
