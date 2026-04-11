import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = db()
    const { data: leads, error } = await sb
      .from('organism_leads')
      .select('id, source, title, triage_score, status, matched_product_id')
      .order('updated_at', { ascending: false })
      .limit(60)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, count: leads?.length ?? 0, sample: leads?.slice(0, 3) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
