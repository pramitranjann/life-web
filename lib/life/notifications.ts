import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { LifeNotificationRecord } from '@/lib/life/types'

export async function createLifeNotification(input: {
  kind: string
  title: string
  body: string
  url?: string | null
  metadata?: Record<string, unknown>
  dedupeKey?: string | null
}): Promise<LifeNotificationRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('life_notifications')
    .insert({
      user_id: OWNER_ID,
      kind: input.kind,
      title: input.title,
      body: input.body,
      url: input.url || null,
      metadata: input.metadata || {},
      dedupe_key: input.dedupeKey || null,
    })
    .select('*')
    .single<LifeNotificationRecord>()

  if (error?.code === '23505') {
    return null
  }
  if (error) {
    throw error
  }

  return data
}

export async function getLifeNotifications(options?: {
  after?: string | null
  unreadOnly?: boolean
  limit?: number
}) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('life_notifications')
    .select('*')
    .eq('user_id', OWNER_ID)
    .order('created_at', { ascending: false })
    .limit(options?.limit || 50)

  if (options?.after) {
    query = query.gt('created_at', options.after)
  }
  if (options?.unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data || []) as LifeNotificationRecord[]
}

export async function setLifeNotificationRead(notificationId: string, read: boolean) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('life_notifications')
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq('user_id', OWNER_ID)
    .eq('id', notificationId)
    .select('*')
    .maybeSingle<LifeNotificationRecord>()

  if (error) {
    throw error
  }

  return data
}
