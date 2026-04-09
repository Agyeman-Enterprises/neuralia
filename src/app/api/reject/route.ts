// POST /api/reject — human rejects a campaign
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import type { CampaignRow } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { campaign_id, reason } =
    await req.json() as { campaign_id: string; reason?: string }

  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  const campaign = await queryOne<CampaignRow>(
    'SELECT * FROM organism_campaigns WHERE id=$1', [campaign_id]
  )
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  await query(
    `UPDATE organism_campaigns SET status='rejected', rejected_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [campaign_id]
  )
  await query(
    `UPDATE organism_leads SET status='rejected', reject_reason=$1, updated_at=NOW() WHERE id=$2`,
    [reason ?? 'Human rejected', campaign.lead_id]
  )

  return NextResponse.json({ ok: true, campaign_id })
}
