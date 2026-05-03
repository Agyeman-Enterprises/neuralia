import type { RawLead } from '@/types'

const REDDIT_SUBREDDITS = (process.env.REDDIT_SUBREDDITS ?? 'r/entrepreneur,r/SaaS')
  .split(',').map(s => s.trim().replace(/^r\//, ''))

const RSS_FEEDS = (process.env.RSS_FEEDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

// ── Reddit ────────────────────────────────────────────────────────────────

export async function scrapeReddit(): Promise<{ leads: RawLead[]; errors: string[] }> {
  const leads: RawLead[] = []
  const errors: string[] = []

  for (const sub of REDDIT_SUBREDDITS) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=25`,
        { headers: { 'User-Agent': 'Neuralia/1.0 marketing-research-bot' }, signal: AbortSignal.timeout(10_000) }
      )
      if (!res.ok) continue
      const json = await res.json() as { data: { children: Array<{ data: RedditPost }> } }

      for (const { data: post } of json.data.children) {
        if (post.is_self && post.selftext && post.selftext.length > 80) {
          leads.push({
            source: 'reddit',
            source_url: `https://reddit.com${post.permalink}`,
            source_id: post.id,
            title: post.title,
            body: post.selftext.slice(0, 2000),
            author: post.author,
            author_url: `https://reddit.com/u/${post.author}`,
            subreddit: sub,
            score: post.score,
          })
        }
      }
    } catch (e) {
      errors.push(`r/${sub}: ${e instanceof Error ? e.message : 'network error'}`)
    }
  }

  return { leads, errors }
}

interface RedditPost {
  id: string
  title: string
  selftext: string
  author: string
  permalink: string
  score: number
  is_self: boolean
}

// ── Hacker News ───────────────────────────────────────────────────────────

export async function scrapeHN(): Promise<RawLead[]> {
  const leads: RawLead[] = []
  const res = await fetch('https://hnrss.org/newest?count=50&points=10', { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return leads
  const xml = await res.text()
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  for (const item of items.slice(0, 30)) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? item.match(/<title>(.*?)<\/title>/))?.[1] ?? ''
    const link = item.match(/<comments>(.*?)<\/comments>/)?.[1] ?? ''
    const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ?? ''
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? link

    if (!title || !link) continue
    leads.push({
      source: 'hn',
      source_url: link,
      source_id: guid.replace(/\D/g, '').slice(-12),
      title,
      body: desc.replace(/<[^>]+>/g, '').slice(0, 1000),
    })
  }
  return leads
}

// ── RSS Feeds ─────────────────────────────────────────────────────────────

export async function scrapeRSS(): Promise<{ leads: RawLead[]; errors: string[] }> {
  const leads: RawLead[] = []
  const errors: string[] = []

  for (const feedUrl of RSS_FEEDS) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(8_000) })
      if (!res.ok) continue
      const xml = await res.text()
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
      for (const item of items.slice(0, 10)) {
        const title =
          (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? item.match(/<title>(.*?)<\/title>/))?.[1] ?? ''
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] ??
          item.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? ''
        const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ??
          item.match(/<description>(.*?)<\/description>/))?.[1] ?? ''
        const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? link

        if (!title || !link) continue
        const id = Buffer.from(guid).toString('base64').slice(0, 20)
        leads.push({
          source: 'rss',
          source_url: link.trim(),
          source_id: `rss_${id}`,
          title: title.trim(),
          body: desc.replace(/<[^>]+>/g, '').slice(0, 1500),
        })
      }
    } catch (e) {
      errors.push(`${feedUrl}: ${e instanceof Error ? e.message : 'network error'}`)
    }
  }
  return { leads, errors }
}

// ── Apollo.io ─────────────────────────────────────────────────────────────

export async function scrapeApollo(keywords: string[]): Promise<RawLead[]> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return []

  const leads: RawLead[] = []
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': key,
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      q_keywords: keywords.join(' OR '),
      page: 1,
      per_page: 20,
      person_titles: ['CEO', 'CTO', 'CMO', 'Founder', 'Director of Marketing', 'VP Marketing', 'Head of Marketing'],
    }),
  })
  if (!res.ok) return leads
  const data = await res.json() as { people?: ApolloPersonResult[] }

  for (const person of data.people ?? []) {
    if (!person.name || !person.organization_name) continue
    leads.push({
      source: 'apollo',
      source_url: person.linkedin_url ?? `https://apollo.io`,
      source_id: `apollo_${person.id}`,
      title: `${person.title ?? 'Leader'} at ${person.organization_name} — ${person.name}`,
      body: [
        person.organization_name && `Company: ${person.organization_name}`,
        person.industry && `Industry: ${person.industry}`,
        person.city && `Location: ${person.city}, ${person.country}`,
        person.headline && `Bio: ${person.headline}`,
      ].filter(Boolean).join('\n'),
      author: person.name,
      author_url: person.linkedin_url ?? undefined,
    })
  }
  return leads
}

interface ApolloPersonResult {
  id: string
  name: string
  title?: string
  headline?: string
  organization_name?: string
  industry?: string
  city?: string
  country?: string
  linkedin_url?: string
}
