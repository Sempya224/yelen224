import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

// Lot 3 (chantier "Messagerie" 19/07/2026) — boîte de réception du support
// Yelen : conversations messages_yelen_citoyen (permanente, jamais fermée)
// ET messages_yelen_institution_conversations (cycle de vie réel depuis le
// Lot 2, 21/08/2026 — voir migration 20260821000014). Contrairement à
// documents-citoyen (lecture seule, responsabilité opérationnelle de
// l'institution), ici Yelen EST la partie prenante — cette route écrit
// réellement (POST) au nom de l'admin connecté.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

type Partie = 'citoyen' | 'institution'
type Statut = 'nouvelle' | 'prise_en_charge' | 'fermee'
type ConversationRow = { id: string; institution_id: string; statut: Statut; pris_en_charge_par: string | null }

export async function GET(request: NextRequest) {
  try {
    const payload = await authorizeAdmin(request, 'messagerie.access')
    const adminId = payload.adminId as string
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as Partie | null
    const id = searchParams.get('id')
    const filtreStatut = searchParams.get('statut') as Statut | null

    if (type && id) {
      if (type === 'citoyen') {
        const { data, error } = await supabaseAdmin
          .from('messages_yelen_citoyen')
          .select('id,expediteur,contenu,image_url,type,lu,cree_le')
          .eq('citoyen_id', id)
          .order('cree_le', { ascending: true })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        await supabaseAdmin.from('messages_yelen_citoyen').update({ lu: true }).eq('citoyen_id', id).neq('expediteur', 'yelen').eq('lu', false)
        return NextResponse.json({ messages: data ?? [] })
      }

      // Institution : `id` est l'id de la CONVERSATION (Lot 2, 21/08/2026),
      // plus l'id de l'institution — une institution peut avoir plusieurs
      // conversations dans le temps (une seule active à la fois).
      const { data: conv } = await supabaseAdmin
        .from('messages_yelen_institution_conversations')
        .select('id,institution_id,statut,pris_en_charge_par')
        .eq('id', id)
        .maybeSingle()
      if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

      const { data, error } = await supabaseAdmin
        .from('messages_yelen_institution')
        .select('id,expediteur,contenu,image_url,type,lu,cree_le')
        .eq('conversation_id', id)
        .order('cree_le', { ascending: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabaseAdmin.from('messages_yelen_institution').update({ lu: true }).eq('conversation_id', id).neq('expediteur', 'yelen').eq('lu', false)

      const statut = conv.statut as Statut
      const etat = { statut, pris_en_charge_par: conv.pris_en_charge_par, verrouillee_par_moi: statut === 'prise_en_charge' && conv.pris_en_charge_par === adminId }
      return NextResponse.json({ messages: data ?? [], etat })
    }

    const [{ data: msgsCitoyen }, { data: msgsInstitution }, { data: conversations }] = await Promise.all([
      supabaseAdmin.from('messages_yelen_citoyen').select('citoyen_id,contenu,type,lu,cree_le,expediteur').order('cree_le', { ascending: true }),
      supabaseAdmin.from('messages_yelen_institution').select('conversation_id,contenu,type,lu,cree_le,expediteur').order('cree_le', { ascending: true }),
      supabaseAdmin.from('messages_yelen_institution_conversations').select('id,institution_id,statut,pris_en_charge_par'),
    ])

    type Entree = { type: Partie; id: string; nom: string; dernier_message: string | null; dernier_message_type: string | null; dernier_message_at: string | null; non_lus: number; statut?: Statut; pris_en_charge_par_nom?: string | null }
    const parCitoyen = new Map<string, { contenu: string | null; type: string; cree_le: string }>()
    const nonLusCitoyen = new Map<string, number>()
    for (const m of msgsCitoyen ?? []) {
      parCitoyen.set(m.citoyen_id, { contenu: m.contenu, type: m.type ?? 'texte', cree_le: m.cree_le })
      if (m.expediteur !== 'yelen' && !m.lu) nonLusCitoyen.set(m.citoyen_id, (nonLusCitoyen.get(m.citoyen_id) ?? 0) + 1)
    }
    // Regroupées par conversation_id (pas institution_id) : une même
    // institution peut avoir plusieurs conversations dans le temps.
    const parConversation = new Map<string, { contenu: string | null; type: string; cree_le: string }>()
    const nonLusConversation = new Map<string, number>()
    for (const m of msgsInstitution ?? []) {
      parConversation.set(m.conversation_id, { contenu: m.contenu, type: m.type ?? 'texte', cree_le: m.cree_le })
      if (m.expediteur !== 'yelen' && !m.lu) nonLusConversation.set(m.conversation_id, (nonLusConversation.get(m.conversation_id) ?? 0) + 1)
    }

    const citoyenIds = [...parCitoyen.keys()]
    const conversationsAvecMessages = (conversations ?? []).filter(c => parConversation.has(c.id)) as ConversationRow[]
    const institutionIds = [...new Set(conversationsAvecMessages.map(c => c.institution_id))]
    const [{ data: users }, { data: institutions }] = await Promise.all([
      citoyenIds.length ? supabaseAdmin.from('users').select('id,nom,prenom,phone').in('id', citoyenIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] }),
      institutionIds.length ? supabaseAdmin.from('institutions').select('id,name').in('id', institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const uMap = new Map((users ?? []).map(u => [u.id, [u.prenom, u.nom].filter(Boolean).join(' ') || u.phone || 'Citoyen']))
    const iMap = new Map((institutions ?? []).map(i => [i.id, i.name]))

    const adminIdsAConsulter = [...new Set(conversationsAvecMessages.map(c => c.pris_en_charge_par).filter((v): v is string => !!v))]
    const { data: adminsRows } = adminIdsAConsulter.length
      ? await supabaseAdmin.from('admin_users').select('id,nom,prenom').in('id', adminIdsAConsulter)
      : { data: [] as { id: string; nom: string | null; prenom: string | null }[] }
    const adminNomMap = new Map((adminsRows ?? []).map(a => [a.id, [a.prenom, a.nom].filter(Boolean).join(' ') || 'Admin']))

    // Par défaut, seules les conversations actives (nouvelle/prise_en_charge)
    // apparaissent — au plus une par institution (contrainte en base). Les
    // fermées, potentiellement plusieurs par institution au fil du temps,
    // ne sont listées que via ?statut=fermee (retour Bryan 21/08/2026).
    const entreesInstitution = conversationsAvecMessages
      .filter(c => filtreStatut ? c.statut === filtreStatut : c.statut !== 'fermee')
      .map(c => ({
        type: 'institution' as const, id: c.id, nom: iMap.get(c.institution_id) ?? 'Institution',
        dernier_message: parConversation.get(c.id)?.contenu ?? null, dernier_message_type: parConversation.get(c.id)?.type ?? null,
        dernier_message_at: parConversation.get(c.id)?.cree_le ?? null, non_lus: nonLusConversation.get(c.id) ?? 0,
        statut: c.statut, pris_en_charge_par_nom: c.pris_en_charge_par ? (adminNomMap.get(c.pris_en_charge_par) ?? null) : null,
      }))

    const entrees: Entree[] = [
      ...(filtreStatut ? [] : citoyenIds.map(id => ({
        type: 'citoyen' as const, id, nom: uMap.get(id) ?? 'Citoyen',
        dernier_message: parCitoyen.get(id)?.contenu ?? null, dernier_message_type: parCitoyen.get(id)?.type ?? null,
        dernier_message_at: parCitoyen.get(id)?.cree_le ?? null, non_lus: nonLusCitoyen.get(id) ?? 0,
      }))),
      ...entreesInstitution,
    ].sort((a, b) => new Date(b.dernier_message_at ?? 0).getTime() - new Date(a.dernier_message_at ?? 0).getTime())

    return NextResponse.json({ conversations: entrees, total_non_lus: entrees.reduce((s, e) => s + e.non_lus, 0) })
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authorizeAdmin(request, 'messagerie.access')
    const adminId = payload.adminId as string

    const body = await request.json().catch(() => null)
    const type = body?.type as Partie
    const id = typeof body?.id === 'string' ? body.id : null
    const contenu = typeof body?.contenu === 'string' ? body.contenu.trim() : ''
    if ((type !== 'citoyen' && type !== 'institution') || !id || !contenu) {
      return NextResponse.json({ error: 'type, id et contenu requis' }, { status: 400 })
    }

    if (type === 'citoyen') {
      const { error } = await supabaseAdmin.from('messages_yelen_citoyen').insert({
        citoyen_id: id, expediteur: 'yelen', admin_id: adminId, contenu, type: 'texte', lu: false,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Verrou de prise en charge (retour Bryan 21/08/2026) — l'admin doit
    // avoir pris en charge CETTE conversation avant d'y répondre. Une
    // conversation fermée n'est plus jamais réutilisable pour répondre
    // (définitif, voir migration 20260821000014) — seule une nouvelle
    // conversation, ouverte par l'institution, peut recevoir une réponse.
    const { data: conv } = await supabaseAdmin
      .from('messages_yelen_institution_conversations')
      .select('id,institution_id,statut,pris_en_charge_par')
      .eq('id', id)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
    if (conv.statut !== 'prise_en_charge' || conv.pris_en_charge_par !== adminId) {
      return NextResponse.json({ error: 'Vous devez prendre en charge cette conversation avant de répondre.', code: 'NON_PRISE_EN_CHARGE' }, { status: 403 })
    }

    const { error } = await supabaseAdmin.from('messages_yelen_institution').insert({
      institution_id: conv.institution_id, conversation_id: id, expediteur: 'yelen', admin_id: adminId, contenu, type: 'texte', lu: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

// Lot 2 — prise en charge / relâche / fermeture, institution uniquement.
// Une seule route PATCH pour les 3 actions plutôt que 3 fichiers séparés :
// même périmètre logique (transitions d'état d'une même ligne), cohérent
// avec la discipline "légalité des transitions en code" déjà appliquée au
// chantier Signalements (lib/signalementsConstants.ts). `id` = id de
// conversation. Pas d'action "rouvrir" : une conversation fermée est
// définitive (retour Bryan 21/08/2026), "prendre_en_charge" n'est valide
// que depuis "nouvelle".
export async function PATCH(request: NextRequest) {
  try {
    const payload = await authorizeAdmin(request, 'messagerie.access')
    const adminId = payload.adminId as string

    const body = await request.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : null
    const action = body?.action as 'prendre_en_charge' | 'relacher' | 'fermer' | undefined
    if (!id || !action) return NextResponse.json({ error: 'id et action requis' }, { status: 400 })

    const { data: conv } = await supabaseAdmin
      .from('messages_yelen_institution_conversations')
      .select('id,statut,pris_en_charge_par')
      .eq('id', id)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
    const statutActuel = conv.statut as Statut

    if (action === 'prendre_en_charge') {
      if (statutActuel === 'fermee') {
        return NextResponse.json({ error: 'Conversation fermée définitivement — impossible de la reprendre. Attendez un nouveau message de l’institution.', code: 'FERMEE_DEFINITIVEMENT' }, { status: 409 })
      }
      if (statutActuel === 'prise_en_charge' && conv.pris_en_charge_par !== adminId) {
        return NextResponse.json({ error: 'Déjà prise en charge par un autre admin.', code: 'DEJA_PRISE_EN_CHARGE' }, { status: 409 })
      }
      const { error } = await supabaseAdmin.from('messages_yelen_institution_conversations').update({
        statut: 'prise_en_charge', pris_en_charge_par: adminId, pris_en_charge_le: new Date().toISOString(), mis_a_jour_le: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (action === 'relacher') {
      if (statutActuel !== 'prise_en_charge' || conv.pris_en_charge_par !== adminId) {
        return NextResponse.json({ error: 'Vous ne pouvez relâcher que vos propres conversations prises en charge.', code: 'NON_AUTORISE' }, { status: 403 })
      }
      const { error } = await supabaseAdmin.from('messages_yelen_institution_conversations').update({
        statut: 'nouvelle', pris_en_charge_par: null, pris_en_charge_le: null, mis_a_jour_le: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (action === 'fermer') {
      if (statutActuel !== 'prise_en_charge' || conv.pris_en_charge_par !== adminId) {
        return NextResponse.json({ error: 'Vous ne pouvez fermer que vos propres conversations prises en charge.', code: 'NON_AUTORISE' }, { status: 403 })
      }
      // Définitif — voir migration 20260821000014 (contrainte d'unicité
      // partielle : une nouvelle conversation active pourra être ouverte
      // par l'institution dès que celle-ci est fermée, jamais celle-ci).
      const { error } = await supabaseAdmin.from('messages_yelen_institution_conversations').update({
        statut: 'fermee', fermee_par: adminId, fermee_le: new Date().toISOString(), mis_a_jour_le: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
