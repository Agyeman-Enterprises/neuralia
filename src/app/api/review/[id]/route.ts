import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = db()

  // Fetch campaign, lead, product in parallel
  const { data: campaign } = await sb.from('organism_campaigns').select('*').eq('id', id).single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: lead }, { data: product }] = await Promise.all([
    sb.from('organism_leads').select('*').eq('id', campaign.lead_id).single(),
    sb.from('organism_products').select('*').eq('id', campaign.product_id).single(),
  ])

  return NextResponse.json({
    lead: lead ? {
      id: lead.id, source: lead.source, source_url: lead.source_url,
      title: lead.title, body: lead.body, author: lead.author,
      subreddit: lead.subreddit, score: lead.score,
      triage_score: lead.triage_score, triage_rationale: lead.triage_rationale,
    } : null,
    campaign: {
      id: campaign.id, title: campaign.title, dek: campaign.dek,
      body: campaign.body, status: campaign.status, brief: campaign.brief,
      edits_body: campaign.edits_body, created_at: campaign.created_at,
    },
    product: product ? {
      name: product.name, class: product.class,
      niche: product.niche, medium_pub: product.medium_pub,
    } : null,
  })
}
