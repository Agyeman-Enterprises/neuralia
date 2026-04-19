import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { campaign_id, priority } = await req.json() as { campaign_id: string; priority: number }
  if (!campaign_id || priority == null) {
    return NextResponse.json({ error: 'campaign_id and priority required' }, { status: 400 })
  }

  const sb = db()
  const { error } = await sb
    .from('organism_campaigns')
    .update({ priority, updated_at: new Date().toISOString() })
    .eq('id', campaign_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
