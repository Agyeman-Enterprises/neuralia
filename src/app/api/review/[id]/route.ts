import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const r = await queryOne(
    `SELECT
       c.id, c.title, c.dek, c.body, c.status, c.brief, c.created_at,
       c.lead_id, c.product_id, c.edits_body,
       l.source, l.source_url, l.title as lead_title, l.body as lead_body,
       l.author, l.subreddit, l.score, l.triage_score, l.triage_rationale,
       p.name as product_name, p.class as product_class, p.niche, p.medium_pub
     FROM organism_campaigns c
     JOIN organism_leads l ON l.id = c.lead_id
     JOIN organism_products p ON p.id = c.product_id
     WHERE c.id = $1`,
    [id]
  )

  if (!r) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({
    lead: {
      id: r.lead_id,
      source: r.source,
      source_url: r.source_url,
      title: r.lead_title,
      body: r.lead_body,
      author: r.author,
      subreddit: r.subreddit,
      score: r.score,
      triage_score: r.triage_score,
      triage_rationale: r.triage_rationale,
    },
    campaign: {
      id: r.id,
      title: r.title,
      dek: r.dek,
      body: r.edits_body ?? r.body,
      status: r.status,
      created_at: r.created_at,
    },
    product: {
      id: r.product_id,
      name: r.product_name,
      class: r.product_class,
      niche: r.niche,
      medium_pub: r.medium_pub,
    },
  })
}
