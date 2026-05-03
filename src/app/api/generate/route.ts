import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateCampaign } from '@/lib/generator'
import { notifyAll } from '@/lib/notifier'
import { publishToAll } from '@/lib/publisher'
import { verifyCron } from '@/lib/verify-cron'
import type { LeadRow, ProductRow, CampaignRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

async function tryAutoApprove(lead: LeadRow, campaign: CampaignRow, product: ProductRow): Promise<boolean> {
  if ((lead.triage_score ?? 0) < 8) return false

  const { count } = await db()
    .from('organism_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product.id)
    .in('status', ['approved', 'posted'])

  if (!count || count < 1) return false

  await db().from('organism_campaigns').update({ status: 'approved', approved_by: 'auto', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaign.id)

  const published = await publishToAll(campaign, product)

  const logEntries = published.map(({ channel, result }) => ({
    campaign_id: campaign.id,
    channel,
    external_id: result?.external_id ?? null,
    external_url: result?.external_url ?? null,
    error: result ? null : 'publish returned null',
  }))
  if (logEntries.length > 0) {
    await db().from('organism_posts_log').insert(logEntries)
  }

  await db().from('organism_campaigns').update({ status: 'posted', posted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaign.id)

  return true
}

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { lead_id } = await req.json() as { lead_id: string }
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const sb = db()
    const { data: lead } = await sb.from('organism_leads').select('*').eq('id', lead_id).single()
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!lead.matched_product_id) return NextResponse.json({ error: 'No matched product' }, { status: 400 })

    const { data: product } = await sb.from('organism_products').select('*').eq('id', lead.matched_product_id).single()
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const result = await generateCampaign(lead as LeadRow, product as ProductRow)
    if (!result) return NextResponse.json({ error: 'Generation failed — see logs' }, { status: 500 })

    const { data: campaign } = await sb.from('organism_campaigns').select('*').eq('id', result.campaignId).single()
    if (!campaign) return NextResponse.json({ error: 'Campaign row missing after generation' }, { status: 500 })

    const autoApproved = await tryAutoApprove(lead as LeadRow, campaign as CampaignRow, product as ProductRow)

    if (!autoApproved) {
      await notifyAll(lead as LeadRow, campaign as CampaignRow, product as ProductRow)
    }

    return NextResponse.json({
      ok: true,
      campaign_id: result.campaignId,
      title: result.title,
      auto_approved: autoApproved,
      review_url: autoApproved ? null : `${process.env.NEXT_PUBLIC_APP_URL}/review/${result.campaignId}`,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sb = db()
    const { data: leads } = await sb
      .from('organism_leads')
      .select('*')
      .eq('status', 'triaged')
      .not('matched_product_id', 'is', null)
      .order('triage_score', { ascending: false })
      .limit(5)

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, generated: 0, message: 'No triaged leads' })
    }

    let generated = 0
    const errors: string[] = []

    for (const lead of leads) {
      try {
        const { data: product } = await sb.from('organism_products').select('*').eq('id', lead.matched_product_id!).single()
        if (!product) continue

        const result = await generateCampaign(lead as LeadRow, product as ProductRow)
        if (!result) continue

        const { data: campaign } = await sb.from('organism_campaigns').select('*').eq('id', result.campaignId).single()
        if (!campaign) continue

        const autoApproved = await tryAutoApprove(lead as LeadRow, campaign as CampaignRow, product as ProductRow)
        if (!autoApproved) {
          await notifyAll(lead as LeadRow, campaign as CampaignRow, product as ProductRow)
        }
        generated++
      } catch (err) {
        errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ ok: true, generated, errors })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
