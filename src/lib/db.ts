import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEURALIA_SUPABASE_URL
    const key = process.env.NEURALIA_SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('NEURALIA_SUPABASE_URL not set')
    if (!key) throw new Error('NEURALIA_SUPABASE_SERVICE_ROLE_KEY not set')
    _client = createClient(url, key)
  }
  return _client
}
