// POST /api/approve — human approves a campaign and triggers posting
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { postMastodon, postMedium } from '@/lib/publisher'
import type { CampaignRow, LeadRow, ProductRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { campaign_id, edits_body, approved_by } =
    await req.json() as { campaign_id: string; edits_body?: string; approved_by?: string }

  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  const campaign = await queryOne<CampaignRow>(
    'SELECT * FROM organism_campaigns WHERE id=$1', [campaign_id]
  )
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: `Campaign already ${campaign.status}` }, { status: 409 })
  }

  const lead = await queryOne<LeadRow>('SELECT * FROM organism_leads WHERE id=$1', [campaign.lead_id])
  const product = await queryOne<ProductRow>(
    'SELECT * FROM organism_products WHERE id=$1', [campaign.product_id]
  )
  if (!lead || !product) return NextResponse.json({ error: 'Related data not found' }, { status: 404 })

  // Save the approved body (use human edits if provided)
  await query(
    `UPDATE organism_campaigns SET
       status='approved', approved_at=NOW(), approved_by=$1,
       edits_body=$2, updated_at=NOW()
     WHERE id=$3`,
    [approved_by ?? 'human', edits_body ?? null, campaign_id]
  )
  await query(
    `UPDATE organism_leads SET status='approved', updated_at=NOW() WHERE id=$1`,
    [campaign.lead_id]
  )

  // Apply edits to campaign object for publishing
  const publishCampaign = { ...campaign, edits_body: edits_body ?? null }

  // Post to channels in parallel
  const posted: string[] = []
  const postResults = await Promise.allSettled([
    postMastodon(publishCampaign, product),
    postMedium(publishCampaign, product),
  ])

  const channels = ['mastodon', 'medium']
  for (let i = 0; i < postResults.length; i++) {
    const result = postResults[i]
    const channel = channels[i]
    if (result.status === 'fulfilled' && result.value) {
      await query(
        `INSERT INTO organism_posts_log (campaign_id, channel, external_id, external_url)
         VALUES ($1,$2,$3,$4)`,
        [campaign_id, channel, result.value.external_id, result.value.external_url]
      )
      posted.push(channel)
    } else if (result.status === 'rejected') {
      await query(
        `INSERT INTO organism_posts_log (campaign_id, channel, error) VALUES ($1,$2,$3)`,
        [campaign_id, channel, String(result.reason)]
      )
    } else if (result.status === 'fulfilled' && !result.value) {
      // Null result = token not set — log as skipped
      await query(
        `INSERT INTO organism_posts_log (campaign_id, channel, error) VALUES ($1,$2,'token_not_configured')`,
        [campaign_id, channel]
      )
    }
  }

  if (posted.length > 0) {
    await query(
      `UPDATE organism_campaigns SET status='posted', updated_at=NOW() WHERE id=$1`,
      [campaign_id]
    )
    await query(
      `UPDATE organism_leads SET status='posted', updated_at=NOW() WHERE id=$1`,
      [campaign.lead_id]
    )
  }

  return NextResponse.json({ ok: true, posted, campaign_id })
}
