// ── Notifier: Alrtme push/SMS + NEXUS alert + JARVIS alert ─────────────────
import type { CampaignRow, LeadRow, ProductRow } from '@/types'
import { query } from './db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neuralia.agyemanenterprises.com'

// ── Alrtme ────────────────────────────────────────────────────────────────

export async function notifyAlrtme(
  lead: LeadRow,
  campaign: CampaignRow,
  product: ProductRow
): Promise<string | null> {
  const key = process.env.ALRTME_API_KEY
  const ingestUrl = process.env.ALRTME_INGEST_URL ?? 'https://alrtme.co/api/ingest'
  if (!key) { console.warn('[notify] ALRTME_API_KEY not set'); return null }

  const reviewUrl = `${APP_URL}/review/${campaign.id}`

  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        source: 'neuralia',
        topic: 'content-approval',
        title: `🧠 ${product.name}: New content ready`,
        message: `Lead from ${lead.source}${lead.subreddit ? ` r/${lead.subreddit}` : ''} — "${campaign.title.slice(0, 80)}" — tap to review and approve.`,
        priority: 'high',
        url: reviewUrl,
        data: {
          campaign_id: campaign.id,
          lead_id: lead.id,
          product: product.name,
          review_url: reviewUrl,
        },
      }),
    })
    const json = await res.json() as { alertId?: string }
    return json.alertId ?? null
  } catch (err) {
    console.error('[notify] Alrtme failed:', err)
    return null
  }
}

// ── NEXUS alert ────────────────────────────────────────────────────────────

export async function notifyNexus(
  lead: LeadRow,
  campaign: CampaignRow,
  product: ProductRow
): Promise<string | null> {
  const nexusUrl = process.env.NEXUS_URL
  const nexusKey = process.env.NEXUS_INTERNAL_KEY
  if (!nexusUrl || !nexusKey) return null

  const reviewUrl = `${APP_URL}/review/${campaign.id}`

  try {
    const res = await fetch(`${nexusUrl}/api/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': nexusKey,
      },
      body: JSON.stringify({
        title: `Neuralia: Content ready for ${product.name}`,
        message: `"${campaign.title}" — lead from ${lead.source}. Score: ${lead.triage_score}/10. Awaiting approval.`,
        severity: 'info',
        entity_id: null,
        metadata: { campaign_id: campaign.id, review_url: reviewUrl, product: product.name },
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as { id?: string }
    return json.id ?? null
  } catch (err) {
    console.error('[notify] NEXUS failed:', err)
    return null
  }
}

// ── JARVIS alert ────────────────────────────────────────────────────────────

export async function notifyJarvis(
  lead: LeadRow,
  campaign: CampaignRow,
  product: ProductRow
): Promise<void> {
  const jarvisUrl = process.env.JARVIS_API_URL
  const jarvisKey = process.env.JARVIS_API_KEY
  if (!jarvisUrl || !jarvisKey) return

  const reviewUrl = `${APP_URL}/review/${campaign.id}`

  try {
    await fetch(`${jarvisUrl}/alerts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jarvisKey}`,
      },
      body: JSON.stringify({
        source: 'neuralia',
        type: 'marketing_content_ready',
        title: `${product.name} content pending approval`,
        body: `Neuralia generated content for ${product.name} based on a ${lead.source} lead. Draft title: "${campaign.title}". Score: ${lead.triage_score}/10. Review at ${reviewUrl}`,
        priority: 'medium',
        metadata: { campaign_id: campaign.id, product_id: product.id, lead_id: lead.id },
      }),
    })
  } catch (err) {
    console.error('[notify] JARVIS failed:', err)
  }
}

// ── Orchestrate all three notifications ──────────────────────────────────

export async function notifyAll(
  lead: LeadRow,
  campaign: CampaignRow,
  product: ProductRow
): Promise<void> {
  const [alrtmeId, nexusId] = await Promise.all([
    notifyAlrtme(lead, campaign, product),
    notifyNexus(lead, campaign, product),
    notifyJarvis(lead, campaign, product),  // fire-and-forget
  ])

  // Store alert IDs in campaign
  await query(
    `UPDATE organism_campaigns SET alrtme_alert_id=$1, nexus_alert_id=$2, updated_at=NOW() WHERE id=$3`,
    [alrtmeId, nexusId, campaign.id]
  )
}
