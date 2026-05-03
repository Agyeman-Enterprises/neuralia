import { createClient } from '@supabase/supabase-js'
import type { LeadRow, ProductRow, TriageResult } from '@/types'

function stratova() {
  const url = process.env.STRATOVA_SUPABASE_URL
  const key = process.env.STRATOVA_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('STRATOVA_SUPABASE_URL or STRATOVA_SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Cache entity UUID by product name so we don't re-query on every lead
const _entityCache = new Map<string, string | null>()

async function resolveEntityId(productName: string): Promise<string | null> {
  if (_entityCache.has(productName)) return _entityCache.get(productName)!
  const { data } = await stratova()
    .from('entities')
    .select('id')
    .ilike('name', productName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  const id = data?.id ?? null
  _entityCache.set(productName, id)
  return id
}

export async function pushLeadToStratova(
  lead: LeadRow,
  product: ProductRow,
  result: TriageResult
): Promise<string | null> {
  const entityId = await resolveEntityId(product.name)
  if (!entityId) return null

  const { data, error } = await stratova()
    .from('crm_contacts')
    .insert({
      entity_id: entityId,
      type: 'lead',
      source: 'neuralia',
      source_campaign: `neuralia_${lead.source}`,
      company: lead.subreddit ? `r/${lead.subreddit}` : lead.source,
      notes: `[Pain signal · score ${result.score}/10]\n${lead.title}\n\nRationale: ${result.rationale}`,
      lead_score: result.score * 10,
      tags: ['neuralia', lead.source, 'auto_triage'],
      utm_source: lead.source,
      utm_campaign: 'neuralia_discovery',
      custom_fields: {
        neuralia_lead_id: lead.id,
        source_url: lead.source_url,
        triage_score: result.score,
        matched_product: product.id,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
