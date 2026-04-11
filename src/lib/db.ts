import { createClient, SupabaseClient } from '@supabase/supabase-js'

const NEURALIA_URL = 'https://xxdisgtbkfrhfutxlwid.supabase.co'

let _client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!_client) {
    const key = process.env.NEURALIA_SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!key) throw new Error('NEURALIA_SUPABASE_SERVICE_ROLE_KEY not set')
    _client = createClient(NEURALIA_URL, key)
  }
  return _client
}
