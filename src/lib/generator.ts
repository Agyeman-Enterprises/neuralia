import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { db } from './db'
import type { LeadRow, ProductRow } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const cfSupabase = process.env.CF_SUPABASE_URL && process.env.CF_SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.CF_SUPABASE_URL, process.env.CF_SUPABASE_SERVICE_ROLE_KEY)
  : null

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  full_post:  'Write a comprehensive long-form blog post with an intro, 4-6 sections with ## headers, and a conclusion. 800-1200 words. Markdown.',
  opinion:    'Write a strong opinion piece. Lead with a provocative thesis, back it with 3-4 sharp arguments, end with a call to action. 500-700 words. Markdown.',
  how_to:     'Write a practical how-to guide. Numbered steps, clear headings, specific actionable advice. 600-900 words. Markdown.',
  listicle:   'Write a listicle with 7-10 numbered points. Each point has a bold title and 2-3 sentence explanation. Scannable and shareable. Markdown.',
  newsletter: 'Write a newsletter issue in a warm curator voice. Short intro, 3-4 curated insights with commentary, key takeaway, sign-off. 500-700 words. Markdown.',
  case_study: 'Write a case study. Structure: Situation > Problem > Approach > Result > Lesson. 600-900 words. Markdown.',
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  authoritative:  'Expert, credible, data-backed — position as a definitive authority.',
  conversational: 'Warm, accessible, human — write like explaining to a smart friend.',
  provocative:    'Contrarian, challenging — question assumptions, make bold claims, spark debate.',
  educational:    'Clear, practical, step-by-step — the reader should leave able to DO something.',
  storytelling:   'Narrative-led, human-interest — open with a story or concrete scenario.',
}

export async function generateCampaign(
  lead: LeadRow,
  product: ProductRow
): Promise<{ campaignId: string; title: string; dek: string | null; body: string } | null> {
  const sb = db()

  // Mark lead as generating
  await sb.from('organism_leads')
    .update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', lead.id)

  const brief = buildBrief(lead, product)
  const formatInstruction = FORMAT_INSTRUCTIONS[product.format] ?? FORMAT_INSTRUCTIONS.full_post
  const toneInstruction = TONE_INSTRUCTIONS[product.tone] ?? TONE_INSTRUCTIONS.authoritative

  const systemPrompt = `You are a world-class content strategist writing for ${product.name}, a ${product.class} product in the ${product.niche} space.
Your audience: ${product.icp ?? 'Healthcare professionals and practice administrators'}
Tone: ${toneInstruction}
${formatInstruction}

ALWAYS output in this exact structure — no deviations:
TITLE: [compelling headline — no quotes, no markdown in this line]
DEK: [one-sentence subhead expanding on the title and teasing the value]
---
[full post body in Markdown]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Write content based on this lead and brief:\n\nLEAD SOURCE: ${lead.source}${lead.subreddit ? ` (r/${lead.subreddit})` : ''}\nLEAD TITLE: ${lead.title}\nLEAD CONTEXT: ${(lead.body ?? '').slice(0, 800)}\n\nBRIEF: ${brief}`
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const titleMatch = text.match(/^TITLE:\s*(.+)$/m)
    const dekMatch = text.match(/^DEK:\s*(.+)$/m)
    const bodyMatch = text.match(/---\n([\s\S]+)$/)

    const title = titleMatch?.[1]?.trim() ?? lead.title
    const dek = dekMatch?.[1]?.trim() ?? null
    const body = bodyMatch?.[1]?.trim() ?? text

    // Write to ContentForge if tenant configured
    let cfPostId: string | null = null
    if (cfSupabase && product.cf_tenant_id) {
      try {
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '-' + Date.now().toString(36)
        const { data: cfPost } = await cfSupabase
          .from('cf_posts')
          .insert({ tenant_id: product.cf_tenant_id, title, slug, dek, body, status: 'draft', type: product.format })
          .select('id')
          .single()
        cfPostId = cfPost?.id ?? null
      } catch (cfErr) {
        console.warn('[generator] ContentForge write failed (non-fatal):', cfErr)
      }
    }

    // Write campaign to Neuralia DB
    const { data: campaign, error: insertErr } = await sb
      .from('organism_campaigns')
      .insert({
        lead_id: lead.id,
        product_id: product.id,
        title,
        dek,
        body,
        brief,
        status: 'draft',
        cf_post_id: cfPostId,
      })
      .select('id')
      .single()

    if (insertErr || !campaign) {
      throw new Error(`Campaign insert failed: ${insertErr?.message}`)
    }

    // Advance lead status
    await sb.from('organism_leads')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    return { campaignId: campaign.id, title, dek, body }
  } catch (err) {
    console.error('[generator] Failed:', err)
    await sb.from('organism_leads')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    return null
  }
}

function buildBrief(lead: LeadRow, product: ProductRow): string {
  const painPoints = (product.pain_points ?? []).slice(0, 5).join(', ')
  return [
    `The opportunity: A ${lead.source} post titled "${lead.title}" indicates someone experiencing pain around: ${lead.triage_rationale}`,
    `Address this pain without mentioning the lead directly.`,
    `Position ${product.name} as the solution. Key pain points to address: ${painPoints}.`,
    `Target reader: ${product.icp ?? 'Healthcare professionals'}`,
    `Do NOT name the person from the lead. Do NOT say "I saw your post". Write evergreen content that speaks to anyone with this pain.`,
  ].join(' ')
}
