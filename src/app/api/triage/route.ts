import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { triageLead, saveTriage } from '@/lib/triage'
import { verifyCron } from '@/lib/verify-cron'
import type { LeadRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batch_size = 20 } = await req.json().catch(() => ({})) as { batch_size?: number }

  const { data: leads } = await db()
    .from('organism_leads')
    .select('*')
    .eq('status', 'raw')
    .order('scraped_at', { ascending: false })
    .limit(batch_size)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, qualified: 0 })
  }

  let qualified = 0
  const errors: string[] = []

  for (const lead of leads as LeadRow[]) {
    try {
      const result = await triageLead(lead)
      await saveTriage(lead.id, result)

      if (result.score >= 6 && result.matched_product_id) {
        qualified++
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.NEURALIA_CRON_SECRET! },
          body: JSON.stringify({ lead_id: lead.id }),
        }).catch(err => console.error('[triage] Failed to kick generate:', err))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${lead.id}: ${msg}`)
      await db()
        .from('organism_leads')
        .update({ status: 'failed', reject_reason: msg, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
    }
  }

  return NextResponse.json({ ok: true, processed: leads.length, qualified, errors })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
