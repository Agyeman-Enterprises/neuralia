// ── Database row types exactly matching migration schema ──────────────────

export interface ProductRow {
  id: string
  name: string
  class: string
  niche: string
  icp: string
  pain_points: string[]
  tone: string
  format: string
  cf_tenant_id: string | null
  medium_account: string | null
  medium_pub: string | null
  target_keywords: string[] | null
  target_subreddits: string[] | null
  description: string | null
  active: boolean
  created_at: string
}

export interface LeadRow {
  id: string
  source: string           // reddit|hn|rss|apollo|hunter
  source_url: string | null
  source_id: string | null
  title: string
  body: string | null
  author: string | null
  author_url: string | null
  subreddit: string | null
  score: number | null
  scraped_at: string
  triage_score: number | null
  triage_rationale: string | null
  matched_product_id: string | null
  triage_at: string | null
  status: LeadStatus
  reject_reason: string | null
  created_at: string
  updated_at: string
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
  id: string
  lead_id: string
  product_id: string
  title: string
  dek: string | null
  body: string
  brief: string
  status: CampaignStatus
  approved_at: string | null
  rejected_at: string | null
  approved_by: string | null
  edits_body: string | null
  cf_post_id: string | null
  alrtme_alert_id: string | null
  nexus_alert_id: string | null
  created_at: string
  updated_at: string
}

export type CampaignStatus = 'draft' | 'approved' | 'rejected' | 'posted'

export interface PostLogRow {
  id: string
  campaign_id: string
  channel: string
  external_id: string | null
  external_url: string | null
  posted_at: string
  error: string | null
}

export interface ScrapeLogRow {
  id: string
  source: string
  fetched_at: string
  count_new: number
  count_dupe: number
  error: string | null
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
