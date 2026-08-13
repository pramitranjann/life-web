import { cache } from 'react'
import { unstable_cache } from 'next/cache'

import type { SettingsRecord } from '@/lib/life/types'

import { OWNER_ID } from '@/lib/life/constants'
import { getLifeServerEnv } from '@/lib/life/env'
import { getSupabaseAdmin } from '@/lib/life/supabase'

// Settings change essentially never. If a settings editor is ever added, it
// must call revalidateTag(SETTINGS_TAG) after writing.
const SETTINGS_TAG = 'life-settings'

// Cross-request cache of the raw settings row. Throws on a DB error so failures
// are never cached; returns null when no row exists yet (caller bootstraps it).
const readSettingsRow = unstable_cache(
  async (): Promise<SettingsRecord | null> => {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', OWNER_ID)
      .maybeSingle()
    if (error) throw error
    return (data as SettingsRecord | null) ?? null
  },
  ['life-settings-row'],
  { tags: [SETTINGS_TAG], revalidate: 3600 },
)

// React cache() deduplicates this across the render tree; readSettingsRow adds
// cross-request caching so the settings table is hit at most once per cache
// window instead of on every navigation.
export const getOwnerSettings = cache(async function getOwnerSettings() {
  const { ownerTimezone } = getLifeServerEnv()

  const data = await readSettingsRow()
  if (data) {
    return {
      ...data,
      timezone: data.timezone || ownerTimezone,
    };
  }

  // No row yet — bootstrap it. Kept off the cached path so the write isn't
  // repeated from inside the cache.
  const supabase = getSupabaseAdmin();
  const fallback: Omit<SettingsRecord, "updated_at"> = {
    user_id: OWNER_ID,
    timezone: ownerTimezone,
    eod_hour: 22,
    eod_minute: 30,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("settings")
    .upsert(fallback, { onConflict: "user_id" })
    .select("*")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    ...inserted,
    timezone: inserted.timezone || ownerTimezone,
  };
})
