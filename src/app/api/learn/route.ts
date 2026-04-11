import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.NEURALIA_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aquiUrl = process.env.AQUI_BASE_URL
  const aquiKey = process.env.AQUI_API_KEY
  if (!aquiUrl || !aquiKey) {
    return NextResponse.json({ error: 'AQUI not configured' }, { status: 500 })
  }

  const sb = db()

  // Get recently posted campaigns with full context
  const { data: campaigns } = await sb
    .from('organism_campaigns')
    .select('id, title, body, created_at, product_id, lead_id')
    .eq('status', 'posted')
    .gte('updated_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: 'No recent posted campaigns' })
  }

  let synced = 0
  for (const c of campaigns) {
    try {
      await fetch(`${aquiUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aquiKey}` },
        body: JSON.stringify({
          content: `Neuralia published: "${c.title}" for product ${c.product_id}. Content: ${(c.body ?? '').slice(0, 500)}`,
          source: 'neuralia_learn',
          importance: 6,
        }),
      })
      synced++
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ ok: true, synced, total: campaigns.length })
}
