import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = db()
    const { count, error } = await sb.from('organism_products').select('id', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({
      ok: true,
      service: 'neuralia',
      products: count ?? 0,
      ts: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
    }, { status: 503 })
  }
}
