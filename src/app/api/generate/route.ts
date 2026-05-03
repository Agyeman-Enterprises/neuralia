import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateCampaign } from '@/lib/generator'
import { notifyAll } from '@/lib/notifier'
import { verifyCron } from '@/lib/verify-cron'
import type { LeadRow, ProductRow, CampaignRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

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
    if (campaign) {
      await notifyAll(lead as LeadRow, campaign as CampaignRow, product as ProductRow)
    }

    return NextResponse.json({
      ok: true,
      campaign_id: result.campaignId,
      title: result.title,
      review_url: `${process.env.NEXT_PUBLIC_APP_URL}/review/${result.campaignId}`,
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
        if (result) {
          const { data: campaign } = await sb.from('organism_campaigns').select('*').eq('id', result.campaignId).single()
          if (campaign) await notifyAll(lead as LeadRow, campaign as CampaignRow, product as ProductRow)
          generated++
        }
      } catch (err) {
        errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ ok: true, generated, errors })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
