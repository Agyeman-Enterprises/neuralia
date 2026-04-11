// POST /api/generate — generates content for a triaged lead
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { generateCampaign } from '@/lib/generator'
import { notifyAll } from '@/lib/notifier'
import type { LeadRow, ProductRow, CampaignRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

import { verifyCron } from '@/lib/verify-cron'

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { lead_id } = await req.json() as { lead_id: string }
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    console.log('[generate] Starting for lead:', lead_id)

    const lead = await queryOne<LeadRow>('SELECT * FROM organism_leads WHERE id=$1', [lead_id])
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    console.log('[generate] Lead found:', lead.title)

    if (!lead.matched_product_id) return NextResponse.json({ error: 'No matched product' }, { status: 400 })

    const product = await queryOne<ProductRow>(
      'SELECT * FROM organism_products WHERE id=$1', [lead.matched_product_id]
    )
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    console.log('[generate] Product found:', product.name)

    const result = await generateCampaign(lead, product)
    if (!result) {
      console.error('[generate] generateCampaign returned null')
      return NextResponse.json({ error: 'Generation failed — see logs' }, { status: 500 })
    }

    console.log('[generate] Campaign created:', result.campaignId)

    // Fetch the campaign we just created
    const campaign = await queryOne<CampaignRow>(
      'SELECT * FROM organism_campaigns WHERE id=$1', [result.campaignId]
    )

    // Fire notifications to Alrtme + NEXUS + JARVIS
    if (campaign) {
      await notifyAll(lead, campaign, product).catch(err =>
        console.error('[generate] notifyAll failed (non-fatal):', err)
      )
    }

    return NextResponse.json({
      ok: true,
      campaign_id: result.campaignId,
      title: result.title,
      review_url: `${process.env.NEXT_PUBLIC_APP_URL}/review/${result.campaignId}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('[generate] FATAL:', msg, stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET handler for Vercel crons
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auto-generate for all triaged leads
  try {
    const leads = await query<LeadRow>(
      "SELECT * FROM organism_leads WHERE status='triaged' AND matched_product_id IS NOT NULL ORDER BY triage_score DESC LIMIT 5"
    )

    if (leads.length === 0) {
      return NextResponse.json({ ok: true, generated: 0, message: 'No triaged leads' })
    }

    let generated = 0
    const errors: string[] = []

    for (const lead of leads) {
      try {
        const product = await queryOne<ProductRow>(
          'SELECT * FROM organism_products WHERE id=$1', [lead.matched_product_id!]
        )
        if (!product) continue

        const result = await generateCampaign(lead, product)
        if (result) {
          const campaign = await queryOne<CampaignRow>(
            'SELECT * FROM organism_campaigns WHERE id=$1', [result.campaignId]
          )
          if (campaign) {
            await notifyAll(lead, campaign, product).catch(() => {})
          }
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
