import { createClient } from '@supabase/supabase-js'
import type { LeadRow, ProductRow, TriageResult } from '@/types'

function cf() {
  const url = process.env.CF_SUPABASE_URL
  const key = process.env.CF_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('CF_SUPABASE_URL or CF_SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Cache CF tenant UUID by medium_pub slug
const _tenantCache = new Map<string, string | null>()

async function resolveTenantId(slug: string): Promise<string | null> {
  if (_tenantCache.has(slug)) return _tenantCache.get(slug)!
  const { data } = await cf()
    .from('cf_tenants')
    .select('id')
    .eq('slug', slug)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  const id = data?.id ?? null
  _tenantCache.set(slug, id)
  return id
}

export async function pushDiscoveryToCF(
  lead: LeadRow,
  product: ProductRow,
  result: TriageResult
): Promise<void> {
  if (!product.medium_pub) return

  const tenantId = await resolveTenantId(product.medium_pub)
  if (!tenantId) return

  const { error } = await cf()
    .from('cf_rss_items')
    .insert({
      tenant_id: tenantId,
      title: lead.title ?? '',
      url: lead.source_url ?? '',
      summary: `[Neuralia · score ${result.score}/10 · ${lead.source}]\n${result.rationale}`,
      relevance_score: result.score / 10,
      status: 'new',
      signal_type: 'opportunity',
      domain_slug: product.medium_pub,
      published_at: lead.scraped_at,
    })

  if (error) throw error
}
