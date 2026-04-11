import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.query('SELECT 1')
    return NextResponse.json({ ok: true, service: 'neuralia', ts: new Date().toISOString() })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
