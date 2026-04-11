// ── Database row types — MUST match actual Supabase schema exactly ─────────
// Schema source: Supabase project xxdisgtbkfrhfutxlwid
// Last verified: 2026-04-11

export interface ProductRow {
  id: string
  name: string
  class: string
  niche: string
  medium_pub: string | null
  target_keywords: string[] | null
  target_subreddits: string[] | null
  description: string | null
  pain_points: string[] | null
  active: boolean
  created_at: string
  format: string        // default 'full_post'
  tone: string          // default 'authoritative'
  icp: string           // default 'Healthcare professionals and practice administrators'
  cf_tenant_id: string | null
  // NOTE: no 'medium_account' column exists — use 'medium_pub'
}

export interface LeadRow {
  id: string              // uuid
  source: string          // reddit|hn|rss|apollo|hunter
  source_url: string | null
  source_id: string | null
  title: string | null
  body: string | null
  author: string | null
  author_url: string | null
  subreddit: string | null
  score: number | null
  status: LeadStatus
  triage_score: number | null
  triage_rationale: string | null
  matched_product_id: string | null
  triage_at: string | null
  reject_reason: string | null
  scraped_at: string      // default now() — this is the creation timestamp
  updated_at: string      // default now()
  // NOTE: no 'created_at' column — use 'scraped_at' for creation time
}

export type LeadStatus =
  | 'raw'
  | 'triaged'
  | 'generating'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'failed'

export interface CampaignRow {
  id: string              // uuid
  lead_id: string         // uuid FK→leads
  product_id: string      // text FK→products
  title: string | null
  dek: string | null
  body: string | null
  format: string          // default 'full_post'
  hashtags: string[] | null
  status: CampaignStatus
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  posted_at: string | null
  alrtme_alert_id: string | null
  nexus_alert_id: string | null
  created_at: string      // default now()
  updated_at: string      // default now()
  brief: string | null
  cf_post_id: string | null
  edits_body: string | null
}

export type CampaignStatus = 'draft' | 'approved' | 'rejected' | 'posted'

export interface PostLogRow {
  id: string              // uuid
  campaign_id: string     // uuid FK→campaigns
  channel: string
  external_id: string | null
  external_url: string | null
  error: string | null
  posted_at: string       // default now()
}

export interface ScrapeLogRow {
  id: string              // uuid
  source: string
  count_new: number       // default 0
  count_dupe: number      // default 0
  error: string | null
  scraped_at: string      // default now() — NOT 'fetched_at'
}

// ── Scraped lead (pre-DB) ─────────────────────────────────────────────────

export interface RawLead {
  source: string
  source_url: string
  source_id: string
  title: string
  body: string
  author?: string
  author_url?: string
  subreddit?: string
  score?: number
}

// ── Triage result ─────────────────────────────────────────────────────────

export interface TriageResult {
  score: number        // 0-10
  rationale: string
  matched_product_id: string | null
}

// ── Review page data (joined) ─────────────────────────────────────────────

export interface ReviewData {
  lead: LeadRow
  campaign: CampaignRow
  product: ProductRow
}
