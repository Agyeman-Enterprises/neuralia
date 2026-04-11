import { createClient, SupabaseClient } from '@supabase/supabase-js'

const NEURALIA_URL = 'https://xxdisgtbkfrhfutxlwid.supabase.co'
const NEURALIA_KEY = process.env.NEURALIA_SUPABASE_SERVICE_ROLE_KEY ?? ''

let _client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!_client) {
    if (!NEURALIA_KEY) throw new Error('NEURALIA_SUPABASE_SERVICE_ROLE_KEY not set')
    _client = createClient(NEURALIA_URL, NEURALIA_KEY)
  }
  return _client
}
