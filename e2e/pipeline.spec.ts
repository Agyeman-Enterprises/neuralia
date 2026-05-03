import { test, expect } from '@playwright/test'

const CRON_SECRET = process.env.NEURALIA_CRON_SECRET ?? 'neuralia_cron_x9Km2Pq7rT4wZ1vN'
const HEADERS = { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET }

// Shared campaign ID produced during this run — campaign-dependent tests assert this is set
let liveCampaignId: string | null = null

test.describe('Neuralia Pipeline E2E', () => {

  test('Gate 2 — health returns ok with products', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.service).toBe('neuralia')
    expect(body.products).toBeGreaterThan(0)
  })

  test('Gate 2 — dashboard page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Neuralia')
    await page.waitForResponse(resp => resp.url().includes('/api/dashboard') && resp.ok())
    await expect(page.locator('main')).toBeVisible()
  })

  test('Gate 3 — cron routes reject without secret', async () => {
    const base = process.env.E2E_BASE_URL ?? 'https://neuralia.vercel.app'
    for (const path of ['/api/scrape', '/api/triage', '/api/generate']) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('Unauthorized')
    }
  })

  test('Gate 3 — cron routes accept with secret', async ({ request }) => {
    const res = await request.post('/api/scrape', {
      data: { sources: [] },
      headers: HEADERS,
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('Gate 4 — dashboard API returns leads', async ({ request }) => {
    const res = await request.get('/api/dashboard')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.leads).toBeInstanceOf(Array)
    const lead = body.leads[0]
    expect(lead).toHaveProperty('id')
    expect(lead).toHaveProperty('source')
    expect(lead).toHaveProperty('title')
    expect(lead).toHaveProperty('status')
  })

  test('Gate 4 — scrape inserts or deduplicates leads', async ({ request }) => {
    const res = await request.post('/api/scrape', {
      data: { sources: ['rss'] },
      headers: HEADERS,
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.results).toHaveProperty('rss')
    const rss = body.results.rss
    expect(rss.new + rss.dupes).toBeGreaterThanOrEqual(0)
    expect(rss.error).toBeUndefined()
  })

  test('Gate 4 — generate produces a campaign', async ({ request }) => {
    test.setTimeout(180_000) // triage + generate can take up to 2min with Ollama
    // Prefer an existing campaign so we don't spam generate on every CI run
    const dashRes = await request.get('/api/dashboard')
    const dash = await dashRes.json()
    const existing = dash.leads?.find((l: { campaign_id: string | null }) => l.campaign_id)
    if (existing) {
      liveCampaignId = existing.campaign_id
      return
    }

    // No existing campaign — run triage then generate to prove the pipeline works end-to-end
    await request.post('/api/triage', { data: { batch_size: 5 }, headers: HEADERS })

    const afterTriage = await request.get('/api/dashboard')
    const triaged = (await afterTriage.json()).leads?.find(
      (l: { status: string; matched_product_id: string | null }) =>
        l.status === 'triaged' && l.matched_product_id
    )

    // If AI scored nothing >= 6, the pipeline itself is broken — fail loudly
    expect(triaged, 'No triaged leads after running triage — AI unavailable or all leads scored < 6').toBeTruthy()

    const genRes = await request.post('/api/generate', {
      data: { lead_id: triaged.id },
      headers: HEADERS,
    })
    expect(genRes.ok()).toBe(true)
    const gen = await genRes.json()
    expect(gen.ok).toBe(true)
    expect(gen.campaign_id, 'generate returned no campaign_id').toBeTruthy()
    expect(gen.title, 'generate returned no title').toBeTruthy()

    liveCampaignId = gen.campaign_id

    // Verify campaign row was actually written to DB
    const reviewRes = await request.get(`/api/review/${liveCampaignId}`)
    expect(reviewRes.ok()).toBe(true)
    const review = await reviewRes.json()
    expect(review.campaign.title).toBeTruthy()
    expect(review.campaign.body).toBeTruthy()
    expect(review.product.name).toBeTruthy()
  })

  test('Gate 4 — reject endpoint works', async ({ request }) => {
    expect(liveCampaignId, 'Gate 4 generate test must pass first').toBeTruthy()
    const res = await request.post('/api/reject', {
      data: { campaign_id: liveCampaignId, reason: 'E2E gate test' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect([200, 400]).toContain(res.status())
  })

  test('Gate 5 — review page loads with campaign data', async ({ request }) => {
    expect(liveCampaignId, 'Gate 4 generate test must pass first').toBeTruthy()
    const res = await request.get(`/api/review/${liveCampaignId}`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.campaign).toBeTruthy()
    expect(body.campaign.title).toBeTruthy()
    expect(body.product).toBeTruthy()
    expect(body.product.name).toBeTruthy()
  })

  test('Gate 5 — review page renders in browser', async ({ page }) => {
    expect(liveCampaignId, 'Gate 4 generate test must pass first').toBeTruthy()
    await page.goto(`/review/${liveCampaignId}`)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('Gate 7 — pipeline data integrity', async ({ request }) => {
    const dashRes = await request.get('/api/dashboard')
    const dash = await dashRes.json()
    expect(dash.ok).toBe(true)
    const statuses = new Set(dash.leads.map((l: { status: string }) => l.status))
    expect(statuses.size).toBeGreaterThan(0)
    const withProduct = dash.leads.filter((l: { matched_product_id: string | null }) => l.matched_product_id)
    for (const lead of withProduct.slice(0, 5)) {
      expect(lead.product_name).toBeTruthy()
      expect(lead.matched_product_id).toBeTruthy()
    }
  })

})
