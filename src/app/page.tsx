import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface DashRow {
  id: string
  campaign_id: string | null
  campaign_status: string | null
  source: string
  subreddit: string | null
  lead_title: string
  product_name: string | null
  triage_score: number | null
  status: string
  created_at: string
  updated_at: string
}

interface Stats {
  total_leads: string
  pending: string
  posted: string
  rejected: string
}

const STATUS_COLOR: Record<string, string> = {
  raw: '#475569',
  triaged: '#7c3aed',
  generating: '#d97706',
  pending_approval: '#f59e0b',
  approved: '#22c55e',
  posted: '#10b981',
  rejected: '#ef4444',
  failed: '#dc2626',
}

async function getData() {
  const sb = db()

  // Fetch leads with product + campaign info via separate queries (no JOINs needed)
  const { data: leads } = await sb
    .from('organism_leads')
    .select('id, source, subreddit, title, triage_score, status, matched_product_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(60)

  // Get product names for matched leads
  const productIds = [...new Set((leads ?? []).map(l => l.matched_product_id).filter(Boolean))]
  const { data: products } = productIds.length > 0
    ? await sb.from('organism_products').select('id, name').in('id', productIds)
    : { data: [] }
  const productMap = new Map((products ?? []).map(p => [p.id, p.name]))

  // Get campaign IDs for leads
  const leadIds = (leads ?? []).map(l => l.id)
  const { data: campaigns } = leadIds.length > 0
    ? await sb.from('organism_campaigns').select('id, lead_id, status').in('lead_id', leadIds)
    : { data: [] }
  const campaignMap = new Map((campaigns ?? []).map(c => [c.lead_id, { id: c.id, status: c.status }]))

  // Build rows
  const rows: DashRow[] = (leads ?? []).map(l => ({
    id: l.id,
    source: l.source,
    subreddit: l.subreddit,
    lead_title: l.title,
    triage_score: l.triage_score,
    status: l.status,
    product_name: productMap.get(l.matched_product_id) ?? null,
    campaign_id: campaignMap.get(l.id)?.id ?? null,
    campaign_status: campaignMap.get(l.id)?.status ?? null,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }))

  // Stats
  const total = (leads ?? []).length
  const pending = (leads ?? []).filter(l => l.status === 'pending_approval').length
  const posted = (leads ?? []).filter(l => l.status === 'posted').length
  const rejected = (leads ?? []).filter(l => l.status === 'rejected').length

  return {
    leads: rows,
    stats: { total_leads: String(total), pending: String(pending), posted: String(posted), rejected: String(rejected) } as Stats,
  }
}

export default async function Dashboard() {
  const { leads, stats } = await getData()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24, background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Neuralia</h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>Autonomous content organism — scrape → triage → generate → approve → publish</p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Leads', value: stats.total_leads },
          { label: 'Pending', value: stats.pending, color: '#f59e0b' },
          { label: 'Posted', value: stats.posted, color: '#10b981' },
          { label: 'Rejected', value: stats.rejected, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 20px', flex: 1 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color ?? '#e2e8f0' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Source</th>
            <th style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Lead</th>
            <th style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Product</th>
            <th style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Score</th>
            <th style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l: DashRow) => (
            <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{l.source}{l.subreddit ? ` (${l.subreddit})` : ''}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>
                {l.campaign_id ? (
                  <a href={`/review/${l.campaign_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>{l.lead_title}</a>
                ) : l.lead_title}
              </td>
              <td style={{ padding: '8px 12px', fontSize: 13, color: '#94a3b8' }}>{l.product_name ?? '—'}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{l.triage_score ?? '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: STATUS_COLOR[l.status] ?? '#475569', color: '#fff' }}>
                  {l.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
