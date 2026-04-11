import { NextRequest } from 'next/server'

/**
 * Verify cron/webhook requests.
 * Accepts:
 * - x-cron-secret header (n8n, external schedulers)
 * - secret query param (Vercel crons)
 * - Authorization: Bearer <CRON_SECRET> (Vercel crons v2)
 */
export function verifyCron(req: NextRequest): boolean {
  const expected = process.env.NEURALIA_CRON_SECRET ?? process.env.CRON_SECRET
  if (!expected) return true // no secret configured = dev mode

  // Check x-cron-secret header
  const headerSecret = req.headers.get('x-cron-secret')
  if (headerSecret === expected) return true

  // Check query param
  const paramSecret = req.nextUrl.searchParams.get('secret')
  if (paramSecret === expected) return true

  // Check Authorization: Bearer header (Vercel crons)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === expected) return true

  return false
}
