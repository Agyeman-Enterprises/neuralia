// ── Publisher: Mastodon + Medium posting ─────────────────────────────────
import type { CampaignRow, ProductRow } from '@/types'

// ── Mastodon ──────────────────────────────────────────────────────────────

export async function postMastodon(
  campaign: CampaignRow,
  product: ProductRow
): Promise<{ external_id: string; external_url: string } | null> {
  const token = process.env.MASTODON_ACCESS_TOKEN
  const instance = process.env.MASTODON_INSTANCE ?? 'https://mastodon.social'
  if (!token) { console.warn('[poster] No MASTODON_ACCESS_TOKEN'); return null }

  // Build toot: title + dek + link-bait + hashtags
  const productHashtag = product.name.replace(/\s+/g, '')
  const classHashtags: Record<string, string> = {
    medical: '#HealthTech #MedTech #DigitalHealth',
    saas: '#SaaS #TechStartup #AI',
    fintech: '#FinTech #Finance #AI',
    education: '#EdTech #Education #AI',
    crypto: '#Crypto #Web3 #DeFi',
    gaming: '#GameDev #IndieGame',
    global: '#Business #Entrepreneurship',
  }
  const hashtags = `#${productHashtag} ${classHashtags[product.class] ?? '#Technology'}`
  const status = `${campaign.title}\n\n${campaign.dek ?? ''}\n\n${hashtags}`.trim().slice(0, 500)

  try {
    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
// Requires Medium Integration Token per account.
// Get at: https://medium.com/me/settings → Integration tokens
// Token for health/medical = MEDIUM_TOKEN_HEALTH
// Token for tech/saas/fintech/other = MEDIUM_TOKEN_TECH

export async function postMedium(
  campaign: CampaignRow,
  product: ProductRow
): Promise<{ external_id: string; external_url: string } | null> {
  const isHealth = ['medical', 'healthcare'].includes(product.class)
  const token = isHealth
    ? process.env.MEDIUM_TOKEN_HEALTH
    : process.env.MEDIUM_TOKEN_TECH

  if (!token) {
    console.warn(`[poster] Medium token not set for class "${product.class}" — skipping. Set ${isHealth ? 'MEDIUM_TOKEN_HEALTH' : 'MEDIUM_TOKEN_TECH'} in env.`)
    return null
  }

  try {
    // Get the user ID for this token
    const meRes = await fetch('https://api.medium.com/v1/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!meRes.ok) { console.error('[poster] Medium /me failed:', meRes.status); return null }
    const meData = await meRes.json() as { data: { id: string } }
    const userId = meData.data.id

    // Build full content with canonical structure
    const fullContent = [
      `# ${campaign.title}`,
      campaign.dek ? `*${campaign.dek}*` : '',
      '',
      campaign.edits_body ?? campaign.body,
    ].filter(s => s !== undefined).join('\n')

    const postRes = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: campaign.title,
        contentFormat: 'markdown',
        content: fullContent,
        publishStatus: 'draft',  // post as draft so you can review on Medium before publishing
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
