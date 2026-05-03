import { NextRequest, NextResponse } from 'next/server'
import { scrapeReddit, scrapeHN, scrapeRSS, scrapeApollo } from '@/lib/scraper'
import { db } from '@/lib/db'
import { verifyCron } from '@/lib/verify-cron'
import type { RawLead } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { sources?: string[] }
  const sources = body.sources ?? ['reddit', 'hn', 'rss', 'apollo']
  const results: Record<string, { new: number; dupes: number; error?: string }> = {}
  const sb = db()

  const scrapeJobs = sources.map(async (src) => {
    let leads: RawLead[] = []
    let sourceErrors: string[] = []
    try {
      if (src === 'reddit') { const r = await scrapeReddit(); leads = r.leads; sourceErrors = r.errors }
      else if (src === 'hn') leads = await scrapeHN()
      else if (src === 'rss') { const r = await scrapeRSS(); leads = r.leads; sourceErrors = r.errors }
      else if (src === 'apollo') {
        const { data: products } = await sb
          .from('organism_products')
          .select('pain_points')
          .eq('active', true)
        const keywords = (products ?? []).flatMap(p => p.pain_points ?? []).slice(0, 10)
        leads = await scrapeApollo(keywords)
      }

      let countNew = 0
      let countDupe = 0

      for (const lead of leads) {
        // Check if already exists before inserting
        const { data: existing } = await sb
          .from('organism_leads')
          .select('id')
          .eq('source', lead.source)
          .eq('source_id', lead.source_id)
          .maybeSingle()

        if (existing) {
          countDupe++
          continue
        }

        const { error } = await sb.from('organism_leads').insert({
          source: lead.source,
          source_url: lead.source_url,
          source_id: lead.source_id,
          title: lead.title,
          body: lead.body ?? null,
          author: lead.author ?? null,
          author_url: lead.author_url ?? null,
          subreddit: lead.subreddit ?? null,
          score: lead.score ?? null,
        })
        if (error) countDupe++
        else countNew++
      }

      const logError = sourceErrors.length > 0 ? sourceErrors.join(' | ') : null
      await sb.from('organism_scrape_log').insert({
        source: src, count_new: countNew, count_dupe: countDupe, error: logError,
      })
      results[src] = { new: countNew, dupes: countDupe, ...(logError ? { error: logError } : {}) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results[src] = { new: 0, dupes: 0, error: msg }
      await sb.from('organism_scrape_log').insert({
        source: src, count_new: 0, count_dupe: 0, error: msg,
      }).then(() => {}, () => {})
    }
  })

  await Promise.all(scrapeJobs)

  const totalNew = Object.values(results).reduce((s, r) => s + r.new, 0)

  // Kick triage for new leads
  if (totalNew > 0) {
    const triageKicked = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.NEURALIA_CRON_SECRET! },
      body: JSON.stringify({ batch_size: Math.min(totalNew, 30) }),
    }).then(r => r.ok).catch(() => false)
    if (!triageKicked) results['triage_kick'] = { new: 0, dupes: 0, error: 'kick failed — will run on next cron' }
  }

  return NextResponse.json({ ok: true, results, total_new: totalNew })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
