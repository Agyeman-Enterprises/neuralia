import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { type } = await req.json() as { type: 'provisional' | 'rejected' }
    if (type !== 'provisional' && type !== 'rejected') {
      return NextResponse.json({ error: 'type must be provisional or rejected' }, { status: 400 })
    }

    const sb = db()
    let deleted = 0

    if (type === 'provisional') {
      const { data } = await sb.from('organism_leads').delete().eq('status', 'provisional').select('id')
      deleted = data?.length ?? 0
    } else {
      const { data: campaigns } = await sb.from('organism_campaigns').delete().eq('status', 'rejected').select('lead_id')
      const leadIds = (campaigns ?? []).map(c => c.lead_id).filter(Boolean)
      if (leadIds.length > 0) {
        await sb.from('organism_leads').delete().in('id', leadIds)
      }
      await sb.from('organism_leads').delete().eq('status', 'rejected')
      deleted = campaigns?.length ?? 0
    }

    return NextResponse.json({ ok: true, deleted, type })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
