import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Quick health check via Supabase client (known to work on Vercel)
    const url = process.env.CF_SUPABASE_URL
    const key = process.env.CF_SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ ok: false, reason: 'missing_config' }, { status: 503 })
    }
    const sb = createClient(url, key)
    const { count, error } = await sb.from('cf_posts').select('*', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({ ok: true, service: 'neuralia', ts: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
