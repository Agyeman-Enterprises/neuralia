import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { LeadRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

// Nightly learning — embed approved campaigns into AQUI for future intelligence
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.NEURALIA_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aquiUrl = process.env.AQUI_BASE_URL
  const aquiKey = process.env.AQUI_API_KEY

  if (!aquiUrl || !aquiKey) {
    return NextResponse.json({ ok: false, reason: 'AQUI not configured' })
  }

  // Get recently posted campaigns
  const rows = await query<{
    campaign_id: string
    title: string
    body: string
    product_name: string
    product_class: string
    niche: string
    posted_channels: string
    posted_at: string
    lead_source: string
    triage_score: number
    triage_rationale: string
  }>(
    `SELECT
       c.id as campaign_id, c.title, c.body, c.created_at,
       p.name as product_name, p.class as product_class, p.niche,
       l.source as lead_source, l.triage_score, l.triage_rationale,
       STRING_AGG(pl.channel, ', ') as posted_channels,
       MAX(pl.posted_at)::text as posted_at
     FROM organism_campaigns c
     JOIN organism_products p ON p.id = c.product_id
     JOIN organism_leads l ON l.id = c.lead_id
     LEFT JOIN organism_posts_log pl ON pl.campaign_id = c.id
     WHERE c.status = 'posted'
       AND c.updated_at > NOW() - INTERVAL '7 days'
     GROUP BY c.id, c.title, c.body, c.created_at,
              p.name, p.class, p.niche, l.source, l.triage_score, l.triage_rationale
     ORDER BY c.created_at DESC
     LIMIT 50`
  )

  let synced = 0
  for (const row of rows) {
    try {
      // Send to AQUI as a structured memory item
      const content = `
NEURALIA MARKETING CAMPAIGN — ${row.product_name} (${row.product_class})
Posted: ${row.posted_at} via ${row.posted_channels}
Lead source: ${row.lead_source} | Triage score: ${row.triage_score}/10
Triage rationale: ${row.triage_rationale}
Niche: ${row.niche}

TITLE: ${row.title}

CONTENT:
${row.body.slice(0, 2000)}
`.trim()

      await fetch(`${aquiUrl}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aquiKey,
        },
        body: JSON.stringify({
          source: 'neuralia',
          type: 'marketing_campaign',
          title: `Neuralia: ${row.product_name} — ${row.title}`,
          content,
          metadata: {
            campaign_id: row.campaign_id,
            product: row.product_name,
            channels: row.posted_channels,
            posted_at: row.posted_at,
          },
        }),
      })
      synced++
    } catch (err) {
      console.error('[learn] AQUI sync failed for', row.campaign_id, err)
    }
  }

  return NextResponse.json({ ok: true, synced, total: rows.length })
}
