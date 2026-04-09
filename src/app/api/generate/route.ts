// POST /api/generate — generates content for a triaged lead
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { generateCampaign } from '@/lib/generator'
import { notifyAll } from '@/lib/notifier'
import type { LeadRow, ProductRow, CampaignRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  return secret === process.env.NEURALIA_CRON_SECRET
}

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { lead_id } = await req.json() as { lead_id: string }
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const lead = await queryOne<LeadRow>('SELECT * FROM organism_leads WHERE id=$1', [lead_id])
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.matched_product_id) return NextResponse.json({ error: 'No matched product' }, { status: 400 })

  const product = await queryOne<ProductRow>(
    'SELECT * FROM organism_products WHERE id=$1', [lead.matched_product_id]
  )
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const result = await generateCampaign(lead, product)
  if (!result) return NextResponse.json({ error: 'Generation failed' }, { status: 500 })

  // Fetch the campaign we just created
  const campaign = await queryOne<CampaignRow>(
    'SELECT * FROM organism_campaigns WHERE id=$1', [result.campaignId]
  )
  if (!campaign) return NextResponse.json({ error: 'Campaign not found after insert' }, { status: 500 })

  // Fire notifications to Alrtme + NEXUS + JARVIS
  await notifyAll(lead, campaign, product)

  return NextResponse.json({
    ok: true,
    campaign_id: result.campaignId,
    title: result.title,
    review_url: `${process.env.NEXT_PUBLIC_APP_URL}/review/${result.campaignId}`,
  })
}
