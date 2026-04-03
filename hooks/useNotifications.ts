import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type Notification = {
  id: string
  type: string
  titre: string
  message: string
  lu: boolean
  rdv_id: string | null
  created_at: string
}

export function useNotifications(userId: string | null) {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [nonLues, setNonLues] = useState(0)

  const fetchNotifs = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) {
      setNotifs(data)
      setNonLues(data.filter(n => !n.lu).length)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchNotifs()

    // Realtime sur la table notifications
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `destinataire_id=eq.${userId}`,
      }, () => {
        fetchNotifs()
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(100)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchNotifs])

  const marquerToutLu = useCallback(async () => {
    if (!userId) return
    await supabase
      .from('notifications')
      .update({ lu: true })
      .eq('destinataire_id', userId)
      .eq('lu', false)
    setNotifs(prev => prev.map(n => ({ ...n, lu: true })))
    setNonLues(0)
  }, [userId])

  const marquerUnLu = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ lu: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
    setNonLues(prev => Math.max(0, prev - 1))
  }, [])

  return { notifs, nonLues, marquerToutLu, marquerUnLu, fetchNotifs }
}