import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyCron } from '@/lib/verify-cron'

export const runtime = 'nodejs'

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

  return NextResponse.json({
    ok: true,
    provisional_purged: provDeleted?.length ?? 0,
    rejected_purged: oldCampaigns?.length ?? 0,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
