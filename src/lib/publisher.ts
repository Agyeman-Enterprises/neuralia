// ── Publisher: Mastodon + Medium posting ─────────────────────────────────
// Health (medical class) → @dramd Mastodon + dramd Medium
// Tech (everything else) → @scalpelnstack Mastodon + scalpelnstack Medium
import type { CampaignRow, ProductRow } from '@/types'

const HEALTH_CLASSES = ['medical', 'healthcare']

function isHealth(product: ProductRow): boolean {
  return HEALTH_CLASSES.includes(product.class)
}

// ── Mastodon ──────────────────────────────────────────────────────────────

export async function postMastodon(
  campaign: CampaignRow,
  product: ProductRow
): Promise<{ external_id: string; external_url: string } | null> {
  // Route to correct Mastodon account
  const health = isHealth(product)
  const token = health
    ? process.env.MASTODON_TOKEN_HEALTH   // @dramd account
    : process.env.MASTODON_ACCESS_TOKEN   // @scalpelnstack account
  const instance = process.env.MASTODON_INSTANCE ?? 'https://mastodon.social'

  if (!token) {
    console.warn(`[poster] No Mastodon token for ${health ? 'health (MASTODON_TOKEN_HEALTH)' : 'tech (MASTODON_ACCESS_TOKEN)'}`)
    return null
  }

  const productHashtag = product.name.replace(/\s+/g, '')
  const classHashtags: Record<string, string> = {
    medical: '#HealthTech #MedTech #DigitalHealth #PhysicianLife',
    saas: '#SaaS #TechStartup #AI',
    fintech: '#FinTech #Finance #TaxStrategy',
    education: '#EdTech #Education',
    dev_tools: '#DevTools #WebDev #AI',
    entertainment: '#Music #Radio #AI',
    telecom: '#CPaaS #Telecom',
    devops: '#DevOps #SysAdmin',
    marketing: '#Marketing #GrowthHacking',
  }
  const hashtags = `#${productHashtag} ${classHashtags[product.class] ?? '#Technology'}`
  const status = `${campaign.title}\n\n${campaign.dek ?? ''}\n\n${hashtags}`.trim().slice(0, 500)

  try {
    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, visibility: 'public' }),
    })
    if (!res.ok) { console.error('[poster] Mastodon error', res.status); return null }
    const data = await res.json() as { id: string; url: string }
    return { external_id: data.id, external_url: data.url }
  } catch (err) {
    console.error('[poster] Mastodon failed:', err)
    return null
  }
}

// ── Medium ────────────────────────────────────────────────────────────────
// Health → MEDIUM_TOKEN_HEALTH (dramd publication)
// Tech → MEDIUM_TOKEN_TECH (scalpelnstack publication)

export async function postMedium(
  campaign: CampaignRow,
  product: ProductRow
): Promise<{ external_id: string; external_url: string } | null> {
  const health = isHealth(product)
  const token = health
    ? process.env.MEDIUM_TOKEN_HEALTH
    : process.env.MEDIUM_TOKEN_TECH

  if (!token) {
    console.warn(`[poster] Medium token not set for ${health ? 'health (MEDIUM_TOKEN_HEALTH/dramd)' : 'tech (MEDIUM_TOKEN_TECH/scalpelnstack)'}`)
    return null
  }

  try {
    const meRes = await fetch('https://api.medium.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!meRes.ok) { console.error('[poster] Medium /me failed:', meRes.status); return null }
    const meData = await meRes.json() as { data: { id: string } }

    const fullContent = [
      `# ${campaign.title}`,
      campaign.dek ? `*${campaign.dek}*` : '',
      '',
      campaign.edits_body ?? campaign.body,
    ].filter(Boolean).join('\n')

    const postRes = await fetch(`https://api.medium.com/v1/users/${meData.data.id}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: campaign.title,
        contentFormat: 'markdown',
        content: fullContent,
        publishStatus: 'draft',
        notifyFollowers: false,
      }),
    })
    if (!postRes.ok) { console.error('[poster] Medium post failed:', postRes.status); return null }
    const postData = await postRes.json() as { data: { id: string; url: string } }
    return { external_id: postData.data.id, external_url: postData.data.url }
  } catch (err) {
    console.error('[poster] Medium failed:', err)
    return null
  }
}
