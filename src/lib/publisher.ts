// ── Publisher: multi-channel content distribution ─────────────────────────
// Health (medical class) → @dramd accounts
// Tech (everything else) → @scalpelnstack accounts
//
// Channels: Mastodon, Medium, Reddit, LinkedIn, Bluesky
import type { CampaignRow, ProductRow } from '@/types'

const HEALTH_CLASSES = ['medical', 'healthcare']

function isHealth(product: ProductRow): boolean {
  return HEALTH_CLASSES.includes(product.class)
}

export type PostResult = { external_id: string; external_url: string } | null

// ── Mastodon ──────────────────────────────────────────────────────────────

export async function postMastodon(campaign: CampaignRow, product: ProductRow): Promise<PostResult> {
  const health = isHealth(product)
  const token = health ? process.env.MASTODON_TOKEN_HEALTH : process.env.MASTODON_ACCESS_TOKEN
  const instance = process.env.MASTODON_INSTANCE ?? 'https://mastodon.social'
  if (!token) { console.warn(`[poster] No Mastodon token for ${health ? 'health' : 'tech'}`); return null }

  const hashtags = (product.target_keywords ?? []).slice(0, 4).map(k => `#${k.replace(/\s+/g, '')}`).join(' ')
  const status = `${campaign.title}\n\n${campaign.dek ?? ''}\n\n${hashtags}`.trim().slice(0, 500)

  try {
    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, visibility: 'public' }),
    })
    if (!res.ok) { console.error('[poster] Mastodon', res.status); return null }
    const data = await res.json() as { id: string; url: string }
    return { external_id: data.id, external_url: data.url }
  } catch (err) { console.error('[poster] Mastodon failed:', err); return null }
}

// ── Medium ────────────────────────────────────────────────────────────────

export async function postMedium(campaign: CampaignRow, product: ProductRow): Promise<PostResult> {
  const health = isHealth(product)
  const token = health ? process.env.MEDIUM_TOKEN_HEALTH : process.env.MEDIUM_TOKEN_TECH
  if (!token) { console.warn(`[poster] No Medium token for ${health ? 'dramd' : 'scalpelnstack'}`); return null }

  try {
    const meRes = await fetch('https://api.medium.com/v1/me', { headers: { Authorization: `Bearer ${token}` } })
    if (!meRes.ok) return null
    const me = await meRes.json() as { data: { id: string } }

    const content = `# ${campaign.title}\n\n${campaign.dek ? `*${campaign.dek}*\n\n` : ''}${campaign.edits_body ?? campaign.body}`
    const postRes = await fetch(`https://api.medium.com/v1/users/${me.data.id}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: campaign.title, contentFormat: 'markdown', content, publishStatus: 'draft', notifyFollowers: false }),
    })
    if (!postRes.ok) return null
    const post = await postRes.json() as { data: { id: string; url: string } }
    return { external_id: post.data.id, external_url: post.data.url }
  } catch (err) { console.error('[poster] Medium failed:', err); return null }
}

// ── Reddit ────────────────────────────────────────────────────────────────
// Env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
// Health → posts to r/medicine, r/doctors, r/healthIT
// Tech → posts to r/SaaS, r/entrepreneur

export async function postReddit(campaign: CampaignRow, product: ProductRow): Promise<PostResult> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD
  if (!clientId || !clientSecret || !username || !password) {
    console.warn('[poster] Reddit credentials not set'); return null
  }

  // Get access token
  try {
    const authRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=password&username=${username}&password=${encodeURIComponent(password)}`,
    })
    if (!authRes.ok) return null
    const auth = await authRes.json() as { access_token: string }

    // Pick subreddit based on product class
    const health = isHealth(product)
    const subreddit = health
      ? (product.target_subreddits?.[0] ?? 'healthIT')
      : (product.target_subreddits?.[0] ?? 'SaaS')

    const body = `${campaign.dek ?? ''}\n\n${(campaign.edits_body ?? campaign.body ?? '').slice(0, 2000)}`

    const postRes = await fetch(`https://oauth.reddit.com/api/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Neuralia/1.0',
      },
      body: `kind=self&sr=${subreddit}&title=${encodeURIComponent(campaign.title ?? 'Untitled')}&text=${encodeURIComponent(body)}`,
    })
    if (!postRes.ok) return null
    const post = await postRes.json() as { json: { data: { id: string; url: string } } }
    return { external_id: post.json.data.id, external_url: post.json.data.url }
  } catch (err) { console.error('[poster] Reddit failed:', err); return null }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────
// Env: LINKEDIN_ACCESS_TOKEN_HEALTH, LINKEDIN_ACCESS_TOKEN_TECH, LINKEDIN_AUTHOR_URN
// Uses LinkedIn UGC Post API

export async function postLinkedIn(campaign: CampaignRow, product: ProductRow): Promise<PostResult> {
  const health = isHealth(product)
  const token = health ? process.env.LINKEDIN_ACCESS_TOKEN_HEALTH : process.env.LINKEDIN_ACCESS_TOKEN_TECH
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN  // format: urn:li:person:XXXXXXXX
  if (!token || !authorUrn) {
    console.warn(`[poster] LinkedIn not configured for ${health ? 'health' : 'tech'}`); return null
  }

  const text = `${campaign.title ?? ''}\n\n${campaign.dek ?? ''}\n\n${(campaign.edits_body ?? campaign.body ?? '').slice(0, 1300)}`

  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
    if (!res.ok) { console.error('[poster] LinkedIn', res.status); return null }
    const postId = res.headers.get('x-restli-id') ?? ''
    return { external_id: postId, external_url: `https://www.linkedin.com/feed/update/${postId}` }
  } catch (err) { console.error('[poster] LinkedIn failed:', err); return null }
}

// ── Bluesky (AT Protocol) ─────────────────────────────────────────────────
// Env: BLUESKY_HANDLE_HEALTH, BLUESKY_PASSWORD_HEALTH, BLUESKY_HANDLE_TECH, BLUESKY_PASSWORD_TECH

export async function postBluesky(campaign: CampaignRow, product: ProductRow): Promise<PostResult> {
  const health = isHealth(product)
  const handle = health ? process.env.BLUESKY_HANDLE_HEALTH : process.env.BLUESKY_HANDLE_TECH
  const password = health ? process.env.BLUESKY_PASSWORD_HEALTH : process.env.BLUESKY_PASSWORD_TECH
  if (!handle || !password) {
    console.warn(`[poster] Bluesky not configured for ${health ? 'health' : 'tech'}`); return null
  }

  try {
    // Create session
    const authRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password }),
    })
    if (!authRes.ok) return null
    const auth = await authRes.json() as { accessJwt: string; did: string }

    const text = `${campaign.title}\n\n${campaign.dek ?? ''}`.slice(0, 300)

    const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: auth.did,
        collection: 'app.bsky.feed.post',
        record: {
          text,
          createdAt: new Date().toISOString(),
          '$type': 'app.bsky.feed.post',
        },
      }),
    })
    if (!postRes.ok) return null
    const post = await postRes.json() as { uri: string; cid: string }
    const postId = post.uri.split('/').pop() ?? ''
    return { external_id: postId, external_url: `https://bsky.app/profile/${handle}/post/${postId}` }
  } catch (err) { console.error('[poster] Bluesky failed:', err); return null }
}

// ── Publish to all channels ───────────────────────────────────────────────

export async function publishToAll(
  campaign: CampaignRow,
  product: ProductRow
): Promise<Array<{ channel: string; result: PostResult }>> {
  const results = await Promise.allSettled([
    postMastodon(campaign, product).then(r => ({ channel: 'mastodon', result: r })),
    postMedium(campaign, product).then(r => ({ channel: 'medium', result: r })),
    postReddit(campaign, product).then(r => ({ channel: 'reddit', result: r })),
    postLinkedIn(campaign, product).then(r => ({ channel: 'linkedin', result: r })),
    postBluesky(campaign, product).then(r => ({ channel: 'bluesky', result: r })),
  ])

  return results
    .filter((r): r is PromiseFulfilledResult<{ channel: string; result: PostResult }> => r.status === 'fulfilled')
    .map(r => r.value)
}
