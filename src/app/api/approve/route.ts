import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { postMastodon, postMedium } from '@/lib/publisher'
import type { CampaignRow, LeadRow, ProductRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { campaign_id, edits_body, approved_by } =
    await req.json() as { campaign_id: string; edits_body?: string; approved_by?: string }

  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  const sb = db()
  const { data: campaign } = await sb.from('organism_campaigns').select('*').eq('id', campaign_id).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'draft') return NextResponse.json({ error: `Campaign already ${campaign.status}` }, { status: 400 })

  const { data: lead } = await sb.from('organism_leads').select('*').eq('id', campaign.lead_id).single()
  const { data: product } = await sb.from('organism_products').select('*').eq('id', campaign.product_id).single()
  if (!lead || !product) return NextResponse.json({ error: 'Lead or product not found' }, { status: 404 })

  // Approve
  await sb.from('organism_campaigns').update({
    status: 'approved', approved_at: new Date().toISOString(),
    approved_by: approved_by ?? 'akua', edits_body: edits_body ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', campaign_id)

  await sb.from('organism_leads').update({
    status: 'approved', updated_at: new Date().toISOString(),
  }).eq('id', lead.id)

  // Apply edits if provided
  const campaignWithEdits = edits_body
    ? { ...campaign, body: edits_body } as CampaignRow
    : campaign as CampaignRow
  const posted: string[] = []

  // Mastodon
  try {
    const result = await postMastodon(campaignWithEdits, product as ProductRow)
    if (result) {
      await sb.from('organism_posts_log').insert({ campaign_id, channel: 'mastodon', external_id: result.external_id, external_url: result.external_url })
      posted.push('mastodon')
    }
  } catch (err) {
    await sb.from('organism_posts_log').insert({ campaign_id, channel: 'mastodon', error: err instanceof Error ? err.message : 'failed' })
  }

  // Medium
  try {
    const result = await postMedium(campaignWithEdits, product as ProductRow)
    if (result) {
      await sb.from('organism_posts_log').insert({ campaign_id, channel: 'medium', external_id: result.external_id, external_url: result.external_url })
      posted.push('medium')
    }
  } catch (err) {
    await sb.from('organism_posts_log').insert({ campaign_id, channel: 'medium', error: err instanceof Error ? err.message : 'failed' })
  }

  // Mark posted
  if (posted.length > 0) {
    await sb.from('organism_campaigns').update({ status: 'posted', updated_at: new Date().toISOString() }).eq('id', campaign_id)
    await sb.from('organism_leads').update({ status: 'posted', updated_at: new Date().toISOString() }).eq('id', lead.id)
  }

  return NextResponse.json({ ok: true, posted })
}
