import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyCron } from '@/lib/verify-cron'

export const runtime = 'nodejs'

async function notifyCleanup(provisional: number, rejected: number): Promise<void> {
  const key = process.env.ALRTME_API_KEY
  const ingestUrl = process.env.ALRTME_INGEST_URL ?? 'https://alrtme.co/api/ingest'
  if (!key) return

  await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      api_key: key,
      source: 'neuralia',
      title: 'Neuralia — daily cleanup ran',
      message: [
        `Provisional purged (>24h): ${provisional}`,
        `Rejected purged (>7d): ${rejected}`,
      ].join('\n'),
      priority: 'low',
      topic: 'system',
    }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = db()
  const provisionalCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rejectedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: provDeleted } = await sb
    .from('organism_leads')
    .delete()
    .eq('status', 'provisional')
    .lt('updated_at', provisionalCutoff)
    .select('id')

  const { data: oldCampaigns } = await sb
    .from('organism_campaigns')
    .delete()
    .eq('status', 'rejected')
    .lt('updated_at', rejectedCutoff)
    .select('lead_id')

  const leadIds = (oldCampaigns ?? []).map(c => c.lead_id).filter(Boolean)
  if (leadIds.length > 0) {
    await sb.from('organism_leads').delete().in('id', leadIds)
  }
  await sb.from('organism_leads').delete().eq('status', 'rejected').lt('updated_at', rejectedCutoff)

  const provisionalCount = provDeleted?.length ?? 0
  const rejectedCount = oldCampaigns?.length ?? 0

  if (provisionalCount > 0 || rejectedCount > 0) {
    await notifyCleanup(provisionalCount, rejectedCount)
  }

  return NextResponse.json({ ok: true, provisional_purged: provisionalCount, rejected_purged: rejectedCount })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
