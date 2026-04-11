// POST /api/scrape — called by n8n on schedule (or directly)
// Scrapes all sources, deduplicates, inserts raw leads, then kicks off triage chain
import { NextRequest, NextResponse } from 'next/server'
import { scrapeReddit, scrapeHN, scrapeRSS, scrapeApollo } from '@/lib/scraper'
import { query } from '@/lib/db'
import type { RawLead } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

import { verifyCron } from '@/lib/verify-cron'

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { sources?: string[] }
  const sources = body.sources ?? ['reddit', 'hn', 'rss', 'apollo']

  const results: Record<string, { new: number; dupes: number; error?: string }> = {}

  // Scrape all requested sources in parallel
  const scrapeJobs = sources.map(async (src) => {
    let leads: RawLead[] = []
    try {
      if (src === 'reddit') leads = await scrapeReddit()
      else if (src === 'hn') leads = await scrapeHN()
      else if (src === 'rss') leads = await scrapeRSS()
      else if (src === 'apollo') {
        // Apollo gets general keywords from all active products
        const products = await query<{ pain_points: string[] }>(
          'SELECT pain_points FROM organism_products WHERE active = true'
        )
        const keywords = products.flatMap(p => p.pain_points ?? []).slice(0, 10)
        leads = await scrapeApollo(keywords)
      }

      let countNew = 0
      let countDupe = 0

      for (const lead of leads) {
        try {
          await query(
            `INSERT INTO organism_leads
               (source, source_url, source_id, title, body, author, author_url, subreddit, score)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (source, source_id) DO NOTHING`,
            [lead.source, lead.source_url, lead.source_id, lead.title,
             lead.body ?? null, lead.author ?? null, lead.author_url ?? null,
             lead.subreddit ?? null, lead.score ?? null]
          )
          countNew++
        } catch {
          countDupe++
        }
      }

      await query(
        `INSERT INTO organism_scrape_log (source, count_new, count_dupe) VALUES ($1,$2,$3)`,
        [src, countNew, countDupe]
      )
      results[src] = { new: countNew, dupes: countDupe }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results[src] = { new: 0, dupes: 0, error: msg }
      await query(
        `INSERT INTO organism_scrape_log (source, count_new, count_dupe, error) VALUES ($1,0,0,$2)`,
        [src, msg]
      ).catch(() => {})
    }
  })

  await Promise.all(scrapeJobs)

  const totalNew = Object.values(results).reduce((s, r) => s + r.new, 0)

  // Fire triage for all new raw leads (async — don't wait)
  if (totalNew > 0) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                  'x-cron-secret': process.env.NEURALIA_CRON_SECRET! },
      body: JSON.stringify({ batch_size: Math.min(totalNew, 30) }),
    }).catch(err => console.error('[scrape] Failed to kick triage:', err))
  }

  return NextResponse.json({ ok: true, results, total_new: totalNew })
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // GET version for n8n webhook trigger
  return POST(req)
}
