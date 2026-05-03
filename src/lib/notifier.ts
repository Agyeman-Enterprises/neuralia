import type { CampaignRow, LeadRow, ProductRow } from '@/types'
import { db } from './db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neuralia.agyemanenterprises.com'

export async function notifyAlrtme(
  lead: LeadRow, campaign: CampaignRow, product: ProductRow
): Promise<string | null> {
  const key = process.env.ALRTME_API_KEY
  const ingestUrl = process.env.ALRTME_INGEST_URL ?? 'https://alrtme.co/api/ingest'
  if (!key) return null

  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        api_key: key,
        source: 'neuralia',
        title: `${product.name}: ${campaign.title}`,
        message: [
          campaign.dek ?? '',
          '',
          (campaign.body ?? '').slice(0, 600),
          '',
          `---`,
          `Review & approve: ${APP_URL}/review/${campaign.id}`,
        ].join('\n').trim(),
        priority: 'high',
        topic: 'content_review',
        url: `${APP_URL}/review/${campaign.id}`,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.alertId ?? null
  } catch (e) {
    await db().from('organism_posts_log').insert({
      campaign_id: campaign.id, channel: 'alrtme_notify',
      error: e instanceof Error ? e.message : 'network error',
    })
    return null
  }
}

export async function notifyNexus(
  lead: LeadRow, campaign: CampaignRow, product: ProductRow
): Promise<string | null> {
  const nexusUrl = process.env.NEXUS_URL
  const nexusKey = process.env.NEXUS_INTERNAL_KEY
  if (!nexusUrl || !nexusKey) return null

  try {
    const res = await fetch(`${nexusUrl}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nexus-internal-key': nexusKey },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        entity_id: product.id,
        type: 'content_generated',
        severity: 'info',
        title: `Neuralia: "${campaign.title}"`,
        description: `Content generated for ${product.name} from ${lead.source} lead. Review: ${APP_URL}/review/${campaign.id}`,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id ?? null
  } catch (e) {
    await db().from('organism_posts_log').insert({
      campaign_id: campaign.id, channel: 'nexus_notify',
      error: e instanceof Error ? e.message : 'network error',
    })
    return null
  }
}

export async function notifyAll(
  lead: LeadRow, campaign: CampaignRow, product: ProductRow
): Promise<void> {
  const [alrtmeId, nexusId] = await Promise.all([
    notifyAlrtme(lead, campaign, product),
    notifyNexus(lead, campaign, product),
  ])

  await db().from('organism_campaigns').update({
    alrtme_alert_id: alrtmeId,
    nexus_alert_id: nexusId,
    updated_at: new Date().toISOString(),
  }).eq('id', campaign.id)
}
