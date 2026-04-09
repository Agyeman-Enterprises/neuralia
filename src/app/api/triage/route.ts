// POST /api/triage — processes raw leads through Ollama scoring
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { triageLead, saveTriage } from '@/lib/triage'
import type { LeadRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  return secret === process.env.NEURALIA_CRON_SECRET
}

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batch_size = 20 } = await req.json().catch(() => ({})) as { batch_size?: number }

  // Fetch unprocessed raw leads
  const leads = await query<LeadRow>(
    `SELECT * FROM organism_leads WHERE status='raw' ORDER BY scraped_at DESC LIMIT $1`,
    [batch_size]
  )

  if (leads.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, qualified: 0 })
  }

  let qualified = 0
  const errors: string[] = []

  for (const lead of leads) {
    try {
      const result = await triageLead(lead)
      await saveTriage(lead.id, result)

      if (result.score >= 6 && result.matched_product_id) {
        qualified++
        // Kick generation immediately for qualified leads
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.NEURALIA_CRON_SECRET!,
          },
          body: JSON.stringify({ lead_id: lead.id }),
        }).catch(err => console.error('[triage] Failed to kick generate:', err))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${lead.id}: ${msg}`)
      await query(
        `UPDATE organism_leads SET status='failed', reject_reason=$1, updated_at=NOW() WHERE id=$2`,
        [msg, lead.id]
      ).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, processed: leads.length, qualified, errors })
}
