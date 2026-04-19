import { db } from './db'
import type { LeadRow, ProductRow, TriageResult } from '@/types'

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://10.0.1.32:11434'
const TRIAGE_MODEL = process.env.OLLAMA_TRIAGE_MODEL ?? 'deepseek-r1:32b'

let _productCache: ProductRow[] | null = null
let _cacheAt = 0

async function getProducts(): Promise<ProductRow[]> {
  if (_productCache && Date.now() - _cacheAt < 300_000) return _productCache
  const { data } = await db()
    .from('organism_products')
    .select('*')
    .eq('active', true)
    .order('id')
  _productCache = (data ?? []) as ProductRow[]
  _cacheAt = Date.now()
  return _productCache
}

export async function triageLead(lead: LeadRow): Promise<TriageResult> {
  const products = await getProducts()

  const productList = products
    .map(p => `- ${p.id}: ${p.name} (${p.class}) — ${p.niche}. Pain signals: ${(p.pain_points ?? []).join(', ')}`)
    .join('\n')

  const prompt = `You are a lead qualification engine for Agyeman Enterprises, a portfolio of 25+ software products.

PRODUCT CATALOG:
${productList}

LEAD TO EVALUATE:
Source: ${lead.source}${lead.subreddit ? ` (${lead.subreddit})` : ''}
Title: ${lead.title}
Content: ${(lead.body ?? '').slice(0, 1200)}

TASK:
1. Score this lead 0-10: does it indicate a real pain point that any product above solves?
   - 0-3: no relevant pain point, or spam/unrelated
   - 4-5: tangentially related, weak signal
   - 6-7: clear pain point, moderate fit
   - 8-10: strong pain point, urgent need expressed, product is a direct solution
2. If score >= 6, identify the SINGLE best matching product ID from the catalog above.
3. Write a 1-sentence rationale.

Respond in this exact JSON format (no markdown, no extra text):
{"score": <number>, "matched_product_id": <string or null>, "rationale": "<sentence>"}`

  // Try Ollama first
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model: TRIAGE_MODEL, prompt, stream: false, options: { temperature: 0.1, num_predict: 200 } }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = await res.json() as { response: string }
    const cleaned = data.response.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Ollama response')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
      matched_product_id: parsed.score >= 6 ? (parsed.matched_product_id ?? null) : null,
      rationale: parsed.rationale ?? '',
    }
  } catch {
    // Anthropic fallback
    try {
      return await anthropicTriage(prompt)
    } catch {
      return fallbackKeywordTriage(lead, products)
    }
  }
}

async function anthropicTriage(prompt: string): Promise<TriageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, temperature: 0.1, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content.find(b => b.type === 'text')?.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Anthropic response')
  const parsed = JSON.parse(jsonMatch[0])
  return {
    score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
    matched_product_id: parsed.score >= 6 ? (parsed.matched_product_id ?? null) : null,
    rationale: parsed.rationale ?? '',
  }
}

function fallbackKeywordTriage(lead: LeadRow, products: ProductRow[]): TriageResult {
  const text = `${lead.title} ${lead.body ?? ''}`.toLowerCase()
  let bestProduct: ProductRow | null = null
  let bestScore = 0
  for (const product of products) {
    const hits = (product.pain_points ?? []).filter(kw => text.includes(kw.toLowerCase())).length
    if (hits > bestScore) { bestScore = hits; bestProduct = product }
  }
  const score = Math.min(7, bestScore * 2)
  return {
    score,
    matched_product_id: score >= 6 ? (bestProduct?.id ?? null) : null,
    rationale: bestScore > 0 ? `Keyword match: ${bestScore} signals for ${bestProduct?.name}` : 'No matching pain signals detected',
  }
}

export async function saveTriage(leadId: string, result: TriageResult): Promise<void> {
  const sb = db()
  if (result.score < 6) {
    await sb.from('organism_leads').update({
      triage_score: result.score,
      triage_rationale: result.rationale,
      triage_at: new Date().toISOString(),
      status: 'provisional',
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)
  } else {
    await sb.from('organism_leads').update({
      triage_score: result.score,
      triage_rationale: result.rationale,
      matched_product_id: result.matched_product_id,
      triage_at: new Date().toISOString(),
      status: 'triaged',
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)
  }
}
