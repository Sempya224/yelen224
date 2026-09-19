import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getAuthenticatedInstitutionId, getAuthenticatedMembre, getInstitutionSessionSid, revoquerAutresSessionsInstitution } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// "Déconnecter tous les autres appareils" — exclut volontairement l'appareil courant
// (identifié par son `sid` de session), sinon l'action se couperait elle-même de son
// propre accès rapide immédiatement après.
//
// Dette technique comblée 30/08/2026 (mirroring admin_sessions) : révoque
// maintenant réellement toute session institution_sessions active d'un autre
// appareil (id != sid courant), pas seulement les remember-tokens comme avant
// GAP-04-04. Simplification par rapport à l'ancien mécanisme
// (institutions.session_revoked_at, timestamp global) : la session courante
// n'a plus besoin d'être réémise avec un `iat` postérieur pour survivre à sa
// propre révocation — elle est simplement exclue du bulk update ci-dessous,
// sa ligne institution_sessions reste intacte.
export async function POST(request: NextRequest) {
  try {
    // getAuthenticatedMembre échoue silencieusement (retourne null) pour une
    // session compte_principal sans membreId (JWT signé avant la fondation
    // multi-comptes, ou institution_membres.compte_principal absent) —
    // repli sur getAuthenticatedInstitutionId dans ce cas, comme avant ce
    // changement.
    const membre = await getAuthenticatedMembre(request)
    const institutionId = membre?.institutionId ?? (await getAuthenticatedInstitutionId(request))
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }
    const currentSid = await getInstitutionSessionSid(request)

    const currentRememberToken = request.cookies.get('yelen224_institution_remember')?.value
    const currentTokenHash = currentRememberToken
      ? crypto.createHash('sha256').update(currentRememberToken).digest('hex')
      : null

    // Trusted Device (30/08/2026) — status='revoked' plutôt qu'un DELETE,
    // historique conservé (voir remember/revoke/route.ts). Cette route
    // révoque aussi les sessions institution_sessions ci-dessous — les
    // autres appareils perdent donc réellement leur session, pas
    // seulement leur statut de confiance.
    let query = supabaseAdmin
      .from('institution_remember_tokens')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('institution_id', institutionId)
      .neq('status', 'revoked')

    if (currentTokenHash) {
      query = query.neq('token_hash', currentTokenHash)
    }

    const { error: updateError } = await query

    if (updateError) {
      console.error('[INSTITUTION REMEMBER REVOKE ALL ERROR]', updateError.code, updateError.message)
      return NextResponse.json({ error: "Les autres appareils n'ont pas pu être déconnectés. Réessayez.", code: 'DELETE_ERROR' }, { status: 500 })
    }

    // institution_sessions — révoque toute session active d'un AUTRE
    // appareil, via la même fonction partagée que pin/set et totp/disable
    // (voir lib/institutionAuth.ts::revoquerAutresSessionsInstitution).
    // currentSid peut être null (session signée avant ce déploiement, sans
    // claim sid) : dans ce cas, on ne peut pas distinguer "cet appareil" des
    // autres, donc on ne revoque aucune session par prudence plutôt que de
    // risquer de couper l'appelant — comportement propre à cette route
    // (contrairement à pin_change/totp_disabled, un sid manquant ici ne doit
    // jamais se rabattre sur "tout révoquer").
    if (currentSid) {
      await revoquerAutresSessionsInstitution(supabaseAdmin, institutionId, currentSid, 'revoked_all_other_devices')
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION REMEMBER REVOKE ALL ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
