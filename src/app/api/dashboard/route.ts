import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = db()

    const { data: leads, error } = await sb
      .from('organism_leads')
      .select('id, source, subreddit, title, triage_score, status, matched_product_id, scraped_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(60)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    // Get product names
    const productIds = [...new Set((leads ?? []).map(l => l.matched_product_id).filter(Boolean))]
    const { data: products } = productIds.length > 0
      ? await sb.from('organism_products').select('id, name').in('id', productIds)
      : { data: [] }
    const productMap = new Map((products ?? []).map(p => [p.id, p.name]))

    // Get campaign IDs
    const leadIds = (leads ?? []).map(l => l.id)
    const { data: campaigns } = leadIds.length > 0
      ? await sb.from('organism_campaigns').select('id, lead_id, status').in('lead_id', leadIds)
      : { data: [] }
    const campaignMap = new Map((campaigns ?? []).map(c => [c.lead_id, { id: c.id, status: c.status }]))

    const rows = (leads ?? []).map(l => ({
      id: l.id,
      source: l.source,
      subreddit: l.subreddit,
      title: l.title,
      triage_score: l.triage_score,
      status: l.status,
      matched_product_id: l.matched_product_id,
      product_name: productMap.get(l.matched_product_id) ?? null,
      campaign_id: campaignMap.get(l.id)?.id ?? null,
      campaign_status: campaignMap.get(l.id)?.status ?? null,
    }))

    return NextResponse.json({ ok: true, leads: rows, count: rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
