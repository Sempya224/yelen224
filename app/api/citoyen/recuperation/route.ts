import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateUpload } from '@/lib/uploadSecurity'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite, destinationCitoyen,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/
const MAX_CIN_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — remplace la Map IP locale
  // (pas de session possible ici par définition, c'est justement le
  // problème à résoudre), voir lib/security/authSecurity.ts. Porte
  // device/IP ici, avant même de connaître ancien_phone (lu dans le
  // FormData plus bas) — le scope destination (ancien_phone) s'ajoute dès
  // qu'il est connu, voir la 2e porte ci-dessous.
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

    const form = await request.formData().catch(() => null)
    if (!form) return finaliser({ error: 'Corps de requête invalide', code: 'BAD_REQUEST' }, 400)

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
      // Pas de destination connue (numéro invalide) — device/IP seuls,
      // pour que le martèlement de formulaires illisibles reste visible
      // au throttle plutôt qu'invisible (revue critique 18/10/2026).
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'recuperation', deviceId, ip, outcome: 'format_invalide', userAgent,
      })
      return finaliser({ error: 'Numéro invalide', code: 'INVALID_FORMAT', security: etat }, 400)
    }

    // 2e porte, scope destination (Priorités 3/4, 18/10/2026) — la porte
    // device/IP ci-dessus ne pouvait pas connaître ancien_phone avant la
    // lecture du FormData (qui contient aussi le fichier). Positionnée ICI,
    // avant tout accès Storage/DB coûteux, mais après la lecture du
    // formulaire (déjà consommée, inévitable pour atteindre ce champ) —
    // seuils les plus stricts du module (1 avertissement / 2 blocage) :
    // opération à fort impact (changement de numéro de récupération).
    const porteDestination = await evaluerTentative(
      supabaseAdmin, { deviceId, ip, destination: destinationCitoyen(ancienPhone) }, undefined, request
    )
    if (porteDestination.state === 'blocked' || porteDestination.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porteDestination.state), code: porteDestination.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porteDestination },
        423
      )
    }

    // À partir d'ici, ancien_phone est connu et valide — chaque échec
    // compte désormais contre le budget device/IP/destination (revue
    // critique 18/10/2026) plutôt que d'être invisible au throttle.
    const echecRecuperation = (outcome: string) => enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'recuperation', deviceId, ip, identifiant: ancienPhone, outcome, userAgent, destination: destinationCitoyen(ancienPhone),
    })

    if (typeof nouveauPhone !== 'string' || !PHONE_REGEX.test(nouveauPhone)) {
      const etat = await echecRecuperation('nouveau_numero_invalide')
      return finaliser({ error: 'Nouveau numéro invalide', code: 'INVALID_FORMAT', security: etat }, 400)
    }
    if (type === 'numero' && ancienPhone === nouveauPhone) {
      const etat = await echecRecuperation('meme_numero')
      return finaliser({ error: "Le nouveau numéro doit être différent de l'ancien", code: 'SAME_PHONE', security: etat }, 400)
    }
    if (typeof prenom !== 'string' || !prenom.trim() || typeof nom !== 'string' || !nom.trim()) {
      const etat = await echecRecuperation('champs_manquants')
      return finaliser({ error: 'Nom et prénom requis', code: 'MISSING_FIELDS', security: etat }, 400)
    }
    if (!(file instanceof File)) {
      const etat = await echecRecuperation('fichier_manquant')
      return finaliser({ error: "Pièce d'identité requise", code: 'MISSING_FILE', security: etat }, 400)
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const verif = await validateUpload(buffer, 'DOCUMENT_KYC', MAX_CIN_SIZE, file.name)
    if (!verif.valid) {
      const etat = await echecRecuperation('fichier_invalide')
      return finaliser({ error: verif.reason, code: 'INVALID_FORMAT', security: etat }, 400)
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
      const etat = await echecRecuperation('erreur_insertion')
      return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR', security: etat }, 500)
    }

    const path = `recuperation/${demande.id}/${crypto.randomUUID()}.${verif.extension}`
    const { error: upErr } = await supabaseAdmin.storage.from('documents-citoyens').upload(path, buffer, { contentType: verif.detectedType })
    if (upErr) {
      console.error('[CITOYEN RECUPERATION UPLOAD ERROR]', upErr)
      const etat = await echecRecuperation('erreur_upload')
      return finaliser({ error: 'Erreur lors du dépôt du document', code: 'UPLOAD_ERROR', security: etat }, 500)
    }

    await supabaseAdmin.from('citoyen_demandes_recuperation').update({ cin_document_url: path }).eq('id', demande.id)

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'recuperation', deviceId, ip, identifiant: ancienPhone, outcome: 'demande_creee', userAgent, destination: destinationCitoyen(ancienPhone),
    })

    return finaliser({ success: true, security: etat }, 200)
  } catch (error) {
    console.error('[CITOYEN RECUPERATION ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
