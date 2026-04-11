import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasDb = !!process.env.DATABASE_URL
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasAlrtme = !!process.env.ALRTME_API_KEY
  return NextResponse.json({
    ok: hasDb && hasAnthropic,
    service: 'neuralia',
    config: { db: hasDb, anthropic: hasAnthropic, alrtme: hasAlrtme },
    ts: new Date().toISOString(),
  })
}
