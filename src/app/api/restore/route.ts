import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json() as { campaign_id: string }
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  const sb = db()
  const { data: campaign } = await sb
    .from('organism_campaigns')
    .select('id, lead_id, status')
    .eq('id', campaign_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!['rejected', 'provisional'].includes(campaign.status)) {
    return NextResponse.json({ error: `Campaign is ${campaign.status} — nothing to restore` }, { status: 400 })
  }

  await sb.from('organism_campaigns').update({
    status: 'draft',
    rejected_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', campaign_id)

  await sb.from('organism_leads').update({
    status: 'pending_approval',
    reject_reason: null,
    updated_at: new Date().toISOString(),
  }).eq('id', campaign.lead_id)

  return NextResponse.json({ ok: true })
}
