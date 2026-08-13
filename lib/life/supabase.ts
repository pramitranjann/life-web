import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'

import { getLifeServerEnv } from '@/lib/life/env'

// Cached per request — one Supabase client instance shared across the entire
// render tree instead of creating a new one on every call site.
export const getSupabaseAdmin = cache(function getSupabaseAdmin() {
  const { supabaseUrl, supabaseServiceRoleKey } = getLifeServerEnv()
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
})
