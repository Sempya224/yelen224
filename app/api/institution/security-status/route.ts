import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getAuthenticatedInstitutionId, getAuthenticatedMembre } from '@/lib/institutionAuth'
import { canAccessTab } from '@/lib/institutionPermissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Un seul appel pour peupler l'onglet Paramètres > Sécurité. Ne renvoie jamais pin_hash,
// token_hash ou credential_id/public_key bruts — uniquement ce qui est nécessaire à
// l'affichage (libellé, dates) et à cibler une révocation (id).
export async function GET(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    // 2FA TOTP (chantier sécurité institution 25/07/2026) — par membre, pas
    // par institution : sessions signées avant la fondation multi-comptes
    // (migration 20260714000001) n'ont pas de membreId, auquel cas la 2FA
    // n'est simplement pas affichable pour l'instant (totp_enabled: false),
    // la session expire naturellement sous 8h.
    const membre = await getAuthenticatedMembre(request)

    // "parametres-securite" = "full" pour admin seul, "none" pour les 4
    // autres rôles (TAB_MATRIX). Corrigé 16/09/2026 (revue) : un premier
    // correctif bloquait TOUTE la route derrière ce contrôle, cassant
    // TotpSection.tsx pour les 4 rôles non-admin qui l'utilisent depuis
    // ProfilTab.tsx (self-scope, voir en-tête de TotpSection.tsx — cette
    // route "n'a aucune restriction de rôle... safe à appeler depuis
    // n'importe quel onglet self-scope"). Seules les données INSTITUTION-WIDE
    // (recovery email/phone, IP des appareils "remember me", passkeys
    // institution-wide) restent admin-only ; totp_enabled/backup_codes du
    // membre appelant restent toujours renvoyés, quel que soit son rôle.
    const accesInstitutionWide = !membre || canAccessTab(membre.role, 'parametres-securite') !== 'none'

    const [institution, credentials, rememberTokens, membreRow] = await Promise.all([
      accesInstitutionWide
        ? supabaseAdmin.from('institutions').select('pin_hash, email, phone').eq('id', institutionId).single().then(r => r.data)
        : Promise.resolve(null),
      // Passkeys par membre (16/09/2026) — cet écran ("Sécurité du compte")
      // ne montre QUE les clés institution-wide du compte principal
      // (membre_id NULL). Les passkeys personnelles d'un membre d'équipe
      // vivent désormais dans son propre "Administration & accès", jamais
      // mélangées ici (éviterait un revoke silencieusement inopérant, la
      // route revoke étant scopée par membre_id).
      accesInstitutionWide
        ? supabaseAdmin
            .from('institution_webauthn_credentials')
            .select('id, device_label, created_at, last_used_at')
            .eq('institution_id', institutionId)
            .is('membre_id', null)
            .order('created_at', { ascending: false })
            .then(r => r.data)
        : Promise.resolve(null),
      accesInstitutionWide
        ? supabaseAdmin
            .from('institution_remember_tokens')
            .select('id, token_hash, user_agent, ip, device_label, device_type, status, created_at, expires_at, last_used_at')
            .eq('institution_id', institutionId)
            .order('created_at', { ascending: false })
            .then(r => r.data)
        : Promise.resolve(null),
      membre
        ? supabaseAdmin.from('institution_membres').select('totp_enabled, totp_backup_codes').eq('id', membre.membreId).maybeSingle().then(r => r.data)
        : Promise.resolve(null),
    ])

    const currentRememberToken = request.cookies.get('yelen224_institution_remember')?.value
    const currentTokenHash = currentRememberToken
      ? crypto.createHash('sha256').update(currentRememberToken).digest('hex')
      : null

    return NextResponse.json({
      success: true,
      pin_configured: !!institution?.pin_hash,
      totp_enabled: !!membreRow?.totp_enabled,
      totp_backup_codes_remaining: Array.isArray(membreRow?.totp_backup_codes) ? membreRow.totp_backup_codes.length : 0,
      recovery_email: institution?.email ?? null,
      recovery_phone: institution?.phone ?? null,
      webauthn_credentials: (credentials ?? []).map(c => ({
        id: c.id,
        device_label: c.device_label,
        created_at: c.created_at,
        last_used_at: c.last_used_at,
      })),
      remember_devices: (rememberTokens ?? []).map(t => ({
        id: t.id,
        device_label: t.device_label,
        device_type: t.device_type,
        // Trusted Device (30/08/2026) — 'trusted'/'pending'/'revoked',
        // voir supabase/migrations/20260830000004_trusted_device.sql.
        status: t.status,
        user_agent: t.user_agent,
        ip: t.ip,
        created_at: t.created_at,
        expires_at: t.expires_at,
        last_used_at: t.last_used_at,
        is_current_device: currentTokenHash !== null && t.token_hash === currentTokenHash,
      })),
    })

  } catch (error) {
    console.error('[INSTITUTION SECURITY STATUS ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
