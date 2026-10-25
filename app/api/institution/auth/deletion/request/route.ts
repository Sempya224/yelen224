import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedMembre, estReauthRecente } from '@/lib/institutionAuth'
import { can } from '@/lib/institutionPermissions'
import { enregistrerAction, getMembreNomPourJournal } from '@/lib/journalActivite'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const MOTIFS = ['trop_cher', 'pas_assez_rdv', 'autre_solution', 'fermeture', 'autre'] as const
const GRACE_PERIOD_DAYS = 30

// Démarre le délai de grâce de 30 jours : enregistre le motif (analytics interne),
// révoque tous les appareils mémorisés + credentials WebAuthn (logout everywhere), puis
// vide le cookie de session courant. Le compte reste connectable (OTP/PIN/biométrie
// continuent de fonctionner) — c'est app/institution/connexion/page.tsx qui, après un
// login réussi, vérifie /deletion/status et affiche l'écran d'annulation au lieu du
// dashboard tant que la demande n'est ni annulée ni purgée.
export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request)
    if (!membre) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }
    if (!can(membre.role, 'compte.delete_request')) {
      await enregistrerAction({
        institutionId: membre.institutionId, membreId: membre.membreId,
        membreNom: await getMembreNomPourJournal(membre.membreId),
        action: 'suppression_compte_acces_refuse', cibleTable: 'institution_deletion_requests',
        details: { role: membre.role },
        req: request,
      })
      return NextResponse.json({ error: 'Accès réservé aux administrateurs', code: 'FORBIDDEN' }, { status: 403 })
    }
    // Moteur de réauthentification (16/09/2026) — déclencher le délai de
    // grâce de suppression du compte est l'action la plus critique de ce
    // fichier, jusqu'ici protégée uniquement par le rôle. Le PIN (+ TOTP si
    // activé) doit être reconfirmé dans les 10 dernières minutes.
    if (!estReauthRecente(membre)) {
      return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: 'REAUTH_REQUIRED' }, { status: 403 })
    }
    const institutionId = membre.institutionId

    const body = await request.json().catch(() => ({}))
    const { motif, commentaire } = body as { motif?: string; commentaire?: string }

    if (!motif || !MOTIFS.includes(motif as typeof MOTIFS[number])) {
      return NextResponse.json({ error: 'Motif invalide', code: 'INVALID_MOTIF' }, { status: 400 })
    }

    const now = new Date()
    const scheduledPurgeAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

    // La demande est enregistrée AVANT toute révocation : un échec ici ne doit
    // jamais déconnecter l'admin ni supprimer ses appareils.
    const { error: upsertError } = await supabaseAdmin
      .from('institution_deletion_requests')
      .upsert(
        {
          institution_id: institutionId,
          motif,
          commentaire: typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null,
          requested_at: now.toISOString(),
          scheduled_purge_at: scheduledPurgeAt.toISOString(),
          cancelled_at: null,
          purged_at: null,
        },
        { onConflict: 'institution_id' }
      )

    if (upsertError) {
      console.error('[INSTITUTION DELETION REQUEST ERROR]', upsertError.code, upsertError.message)
      return NextResponse.json({ error: "Erreur lors de l'enregistrement", code: 'UPSERT_ERROR' }, { status: 500 })
    }

    // Ni le motif ni le commentaire du sondage ne sont journalisés.
    const membreNom = await getMembreNomPourJournal(membre.membreId)
    await enregistrerAction({
      institutionId, membreId: membre.membreId, membreNom,
      action: 'suppression_compte_demandee', cibleTable: 'institution_deletion_requests',
      details: { role: membre.role, scheduled_purge_at: scheduledPurgeAt.toISOString() },
      req: request,
    })

    // Révocations en best-effort, sans rollback de la demande : chaque échec est
    // journalisé et signalé via revocation_partielle. Sessions en dernier
    // (institution_sessions, dette comblée 30/08/2026) : invalide toute session
    // active, y compris celle-ci.
    const echecs: string[] = []
    const revocations: Array<{ nom: string; run: () => PromiseLike<{ error: { message: string } | null }> }> = [
      { nom: 'appareils_memorises', run: () => supabaseAdmin.from('institution_remember_tokens').delete().eq('institution_id', institutionId) },
      { nom: 'passkeys', run: () => supabaseAdmin.from('institution_webauthn_credentials').delete().eq('institution_id', institutionId) },
      { nom: 'sessions', run: () => supabaseAdmin.from('institution_sessions').update({ revoked_at: now.toISOString(), revoked_reason: 'deletion_request' }).eq('institution_id', institutionId).is('revoked_at', null) },
    ]
    for (const { nom, run } of revocations) {
      const { error } = await run()
      if (!error) continue
      echecs.push(nom)
      console.error('[INSTITUTION DELETION REQUEST] Erreur révocation', nom, error.message)
      await enregistrerAction({
        institutionId, membreId: membre.membreId, membreNom,
        action: 'suppression_compte_revocation_echec', cibleTable: 'institution_deletion_requests',
        details: { revocation_echec: nom },
        niveau: 'attention',
        req: request,
      })
    }

    const response = NextResponse.json({
      success: true,
      scheduled_purge_at: scheduledPurgeAt.toISOString(),
      ...(echecs.length > 0 ? { revocation_partielle: true } : {}),
    })
    response.cookies.delete('yelen224_institution_session')
    response.cookies.delete('yelen224_institution_remember')
    return response

  } catch (error) {
    console.error('[INSTITUTION DELETION REQUEST ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
