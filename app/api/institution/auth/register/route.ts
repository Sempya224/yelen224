import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { validerUrlExterne } from '@/lib/urlValidation'
import { STATUT_JURIDIQUE_ID_LIST } from '@/lib/institutionTaxonomy'
import { extraireIpClient } from '@/lib/edgeSecurity'
import { generateInstitutionSlug } from '@/lib/institutionSlug'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

const PHONE_REGEX = /^\+224\d{8,9}$/

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — remplace les 2 Map locales
  // (ipAttempts/failedAttempts), voir lib/security/authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip })
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    const body = await request.json()
    const {
      phone, code, name, category, ville, email, website, description,
      responsable_prenom, responsable_nom, responsable_role,
      activite_categorie_id, activite_principale_id, activites_secondaires_ids,
      statut_juridique,
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
    // Chantier Taxonomie des activités (Phase 2, 20/08/2026) — remplace la
    // validation SECTEUR_ID_LIST par un contrôle réel contre
    // activite_categories/activites (jamais faire confiance aux ids
    // envoyés par le client). institutions.secteur n'est plus jamais
    // écrite par ce flux (gelée, pas supprimée — spec §14/§19 décision F).
    if (!activite_categorie_id || typeof activite_categorie_id !== 'string') {
      return NextResponse.json(
        { error: 'La catégorie d\'activité est requise', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!activite_principale_id || typeof activite_principale_id !== 'string') {
      return NextResponse.json(
        { error: "L'activité principale est requise", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    const secondairesIds: string[] = Array.isArray(activites_secondaires_ids)
      ? activites_secondaires_ids.filter((v): v is string => typeof v === 'string')
      : []
    if (secondairesIds.length > 3) {
      return NextResponse.json(
        { error: 'Au maximum 3 activités secondaires', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }
    if (secondairesIds.includes(activite_principale_id)) {
      return NextResponse.json(
        { error: 'Une activité secondaire ne peut pas être identique à l\'activité principale', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    const { data: categorieRow } = await supabaseAdmin
      .from('activite_categories')
      .select('id')
      .eq('id', activite_categorie_id)
      .eq('actif', true)
      .maybeSingle()
    if (!categorieRow) {
      return NextResponse.json(
        { error: 'Catégorie d\'activité invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    const activiteIdsAVerifier = [activite_principale_id, ...secondairesIds]
    const { data: activiteRows } = await supabaseAdmin
      .from('activites')
      .select('id')
      .in('id', activiteIdsAVerifier)
      .eq('categorie_id', activite_categorie_id)
      .eq('statut', 'active')
    if (!activiteRows || activiteRows.length !== new Set(activiteIdsAVerifier).size) {
      return NextResponse.json(
        { error: 'Activité invalide ou n\'appartenant pas à la catégorie choisie', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    if (!statut_juridique || typeof statut_juridique !== 'string' || !STATUT_JURIDIQUE_ID_LIST.includes(statut_juridique)) {
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

    // P0 Stored XSS (17/08/2026) — website optionnel à l'inscription mais,
    // s'il est fourni, doit déjà être une URL http(s) propre. Même
    // validation que app/api/institution/profile/route.ts (seul autre
    // point d'écriture de ce champ).
    let websiteValide: string = ''
    if (typeof website === 'string' && website.trim()) {
      const validation = validerUrlExterne(website)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error, code: 'INVALID_FORMAT' }, { status: 400 })
      }
      websiteValide = validation.url
    }

    // Ne pas dupliquer une institution déjà enregistrée sur ce numéro
    const { data: existing } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_register', deviceId, ip, identifiant: phone, outcome: 'deja_enregistre', userAgent,
      })
      return finaliser({ error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED', security: etat }, 409)
    }

    // Revalidation complète du code OTP — ne fait jamais confiance à un état
    // "vérifié" déclaré par le client (voir /verify-otp appelé en amont côté UI).
    // Durcissement Lot 1.1 (13/08/2026, remédiation GAP-04-01) — plus de
    // bypass en dur, voir send-otp/route.ts pour la génération du code réel.
    let verified = false
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

    if (!verified) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_register', deviceId, ip, identifiant: phone, outcome: 'code_incorrect', userAgent,
      })
      return finaliser({ error: 'Code incorrect', code: 'INVALID_CODE', security: etat }, 401)
    }

    // Slug URL-friendly requis par institutions.slug (NOT NULL UNIQUE + CHECK
    // de format, migration 20260805000010, portail Clock In Shift
    // /clock/{slug}, et depuis le chantier "URLs dynamiques institution"
    // 28/08/2026 racine du dashboard authentifié /{slug}/{id}/{screen}) —
    // jamais fourni par ce flux avant un premier correctif, ce qui faisait
    // échouer TOUTE nouvelle inscription depuis l'exécution de cette
    // migration (violation NOT NULL, remontée en "Erreur lors de la création
    // de l'institution", bug réel signalé par Bryan le 12/08/2026).
    const slug = await generateInstitutionSlug(supabaseAdmin, name)

    // Création de l'institution — niveau_confiance non fourni : la colonne a
    // un défaut ('profil_basique') côté base, source unique de vérité.
    const { data: institution, error: insertError } = await supabaseAdmin
      .from('institutions')
      .insert({
        name: name.trim(),
        slug,
        ...(typeof category === 'string' && category.trim() ? { category: category.trim() } : {}),
        activite_categorie_id,
        statut_juridique,
        ville: ville.trim(),
        phone,
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        website: websiteValide || null,
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

    // Activité principale + secondaires — institution_activites (migration
    // 20260821000005). Non bloquant comme les autres inserts secondaires
    // de ce flux : l'institution existe déjà à ce stade.
    const activiteRowsToInsert = [
      { institution_id: institution.id, activite_id: activite_principale_id, principale: true, ordre: 0 },
      ...secondairesIds.map((id, i) => ({ institution_id: institution.id, activite_id: id, principale: false, ordre: i + 1 })),
    ]
    const { error: activitesError } = await supabaseAdmin.from('institution_activites').insert(activiteRowsToInsert)
    if (activitesError) {
      console.error('[INSTITUTION REGISTER ACTIVITES INSERT ERROR]', activitesError.code, activitesError.message, activitesError.details, activitesError.hint)
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

    // Établir la session — identique à /verify-otp en flux connexion.
    // institution_sessions (dette technique comblée 30/08/2026, mirroring
    // admin_sessions) — voir lib/institutionAuth.ts::creerSessionInstitution.
    const sid = await creerSessionInstitution(supabaseAdmin, {
      institutionId: institution.id, phone, userAgent: request.headers.get('user-agent'), ip,
    })
    if (!sid) {
      return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
    }

    const token = await new SignJWT({
      institutionId: institution.id,
      ...(membrePrincipal ? { membreId: membrePrincipal.id, role: membrePrincipal.role } : {}),
      sid,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    const etatFinal = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_register', deviceId, ip, identifiant: phone, outcome: 'compte_cree', userAgent,
    })

    const response = finaliser({
      success: true,
      institution: { id: institution.id, name: institution.name },
      security: etatFinal,
    }, 200)

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
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
