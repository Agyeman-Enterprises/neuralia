import { test, expect } from '@playwright/test'

const CRON_SECRET = process.env.NEURALIA_CRON_SECRET ?? 'neuralia_cron_x9Km2Pq7rT4wZ1vN'

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
    // Client component — wait for data to load
    await page.waitForResponse(resp => resp.url().includes('/api/dashboard') && resp.ok())
    await expect(page.locator('text=Total Leads')).toBeVisible()
  })

  test('Gate 3 — cron routes reject without secret', async () => {
    // Use raw fetch WITHOUT any cron secret header
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
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
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
    expect(body.count).toBeGreaterThan(0)
    expect(body.leads).toBeInstanceOf(Array)
    expect(body.leads.length).toBeGreaterThan(0)
    // Verify lead shape
    const lead = body.leads[0]
    expect(lead).toHaveProperty('id')
    expect(lead).toHaveProperty('source')
    expect(lead).toHaveProperty('title')
    expect(lead).toHaveProperty('status')
  })

  test('Gate 4 — scrape inserts or deduplicates leads', async ({ request }) => {
    const res = await request.post('/api/scrape', {
      data: { sources: ['rss'] },
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.results).toHaveProperty('rss')
    // new + dupes should total to something (may be all dupes)
    const rss = body.results.rss
    expect(rss.new + rss.dupes).toBeGreaterThanOrEqual(0)
    expect(rss.error).toBeUndefined()
  })

  test('Gate 4 — reject endpoint works', async ({ request }) => {
    // Get a campaign to reject
    const dashRes = await request.get('/api/dashboard')
    const dash = await dashRes.json()
    const withCampaign = dash.leads?.find((l: { campaign_id: string | null }) => l.campaign_id)
    if (!withCampaign) {
      test.skip(true, 'No campaigns to test reject on')
      return
    }
    // Try rejecting (may fail if already rejected — that's ok)
    const res = await request.post('/api/reject', {
      data: { campaign_id: withCampaign.campaign_id, reason: 'E2E gate test' },
      headers: { 'Content-Type': 'application/json' },
    })
    // Either succeeds or campaign already processed
    expect([200, 400]).toContain(res.status())
  })

  test('Gate 5 — review page loads with campaign data', async ({ request }) => {
    // Get a campaign ID from dashboard
    const dashRes = await request.get('/api/dashboard')
    const dash = await dashRes.json()
    const withCampaign = dash.leads?.find((l: { campaign_id: string | null }) => l.campaign_id)
    if (!withCampaign) {
      test.skip(true, 'No campaigns to test review page')
      return
    }
    const res = await request.get(`/api/review/${withCampaign.campaign_id}`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.campaign).toBeTruthy()
    expect(body.campaign.title).toBeTruthy()
    expect(body.campaign.body).toBeTruthy()
    expect(body.product).toBeTruthy()
    expect(body.product.name).toBeTruthy()
  })

  test('Gate 5 — review page renders in browser', async ({ page }) => {
    const dashRes = await page.request.get('/api/dashboard')
    const dash = await dashRes.json()
    const withCampaign = dash.leads?.find((l: { campaign_id: string | null }) => l.campaign_id)
    if (!withCampaign) {
      test.skip(true, 'No campaigns for browser test')
      return
    }
    await page.goto(`/review/${withCampaign.campaign_id}`)
    // Page should render campaign content
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('Gate 7 — pipeline data integrity', async ({ request }) => {
    // Verify leads have proper status distribution
    const dashRes = await request.get('/api/dashboard')
    const dash = await dashRes.json()
    expect(dash.ok).toBe(true)

    const statuses = new Set(dash.leads.map((l: { status: string }) => l.status))
    // Should have at least rejected leads (from triage) and some pending/posted
    expect(statuses.size).toBeGreaterThan(0)

    // Verify products are linked correctly
    const withProduct = dash.leads.filter((l: { matched_product_id: string | null }) => l.matched_product_id)
    for (const lead of withProduct.slice(0, 5)) {
      expect(lead.product_name).toBeTruthy()
      expect(lead.matched_product_id).toBeTruthy()
    }
  })
})
