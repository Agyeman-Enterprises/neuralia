import { query } from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DashRow {
  id: string
  campaign_id: string | null
  campaign_status: string | null
  source: string
  subreddit: string | null
  lead_title: string
  triage_score: number | null
  product_name: string | null
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

async function getData() {
  const [leadRows, statsRows] = await Promise.all([
    query<DashRow>(
      `SELECT
         l.id, l.source, l.subreddit, l.title as lead_title,
         l.triage_score, l.status, l.created_at, l.updated_at,
         p.name as product_name,
         c.id as campaign_id, c.status as campaign_status
       FROM organism_leads l
       LEFT JOIN organism_products p ON p.id = l.matched_product_id
       LEFT JOIN organism_campaigns c ON c.lead_id = l.id
       ORDER BY l.updated_at DESC
       LIMIT 60`
    ),
    query<Stats>(
      `SELECT
         COUNT(*)::text as total_leads,
         COUNT(*) FILTER (WHERE status='pending_approval')::text as pending,
         COUNT(*) FILTER (WHERE status='posted')::text as posted,
         COUNT(*) FILTER (WHERE status='rejected')::text as rejected
       FROM organism_leads`
    ),
  ])
  return { leads: leadRows, stats: statsRows[0] }
}

const STATUS_COLOR: Record<string, string> = {
  raw: '#475569',
  triaged: '#7c3aed',
  generating: '#d97706',
  pending_approval: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  posted: '#6366f1',
  failed: '#dc2626',
}

export default async function DashboardPage() {
  const { leads, stats } = await getData()

  const pending = leads.filter(l => l.status === 'pending_approval')
  const recent = leads.filter(l => l.status !== 'pending_approval')

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e12', color: '#f0eff8', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Top bar */}
      <header style={{ borderBottom: '1px solid rgba(240,239,248,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            🧠 Neuralia
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(240,239,248,0.35)' }}>
            Autonomous Marketing Organism
          </p>
        </div>
        <form action="/api/scrape" method="post" style={{ display: 'flex', gap: 8 }}>
          <input type="hidden" name="secret" value="" />
          <a
            href={`/api/scrape?secret=${process.env.NEURALIA_CRON_SECRET}`}
            style={{ fontSize: 12, color: '#6366f1', border: '1px solid #6366f133', borderRadius: 8, padding: '6px 14px', textDecoration: 'none' }}
          >
            ▶ Run Scrape
          </a>
        </form>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total Leads', value: stats?.total_leads ?? '0', color: '#94a3b8' },
            { label: 'Pending Approval', value: stats?.pending ?? '0', color: '#f59e0b' },
            { label: 'Posted', value: stats?.posted ?? '0', color: '#6366f1' },
            { label: 'Rejected', value: stats?.rejected ?? '0', color: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ background: '#16161c', border: '1px solid rgba(240,239,248,0.07)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,239,248,0.4)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pending approval */}
        {pending.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
              🔔 Awaiting Your Approval ({pending.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pending.map(row => (
                <Link key={row.id} href={`/review/${row.campaign_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#1c1a10', border: '1px solid #f59e0b44', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#f0eff8' }}>{row.lead_title}</span>
                      <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>Review →</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' as const }}>
                      <Tag>{row.source}{row.subreddit ? ` · r/${row.subreddit}` : ''}</Tag>
                      {row.product_name && <Tag accent>{row.product_name}</Tag>}
                      {row.triage_score != null && <Tag>{row.triage_score}/10</Tag>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All leads */}
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(240,239,248,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
            All Leads
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.map(row => {
              const color = STATUS_COLOR[row.status] ?? '#475569'
              const isReviewable = row.status === 'pending_approval' && row.campaign_id
              return (
                <div key={row.id} style={{ background: '#16161c', border: '1px solid rgba(240,239,248,0.07)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.lead_title}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,239,248,0.35)' }}>
                      {row.source}{row.subreddit ? ` · r/${row.subreddit}` : ''}
                      {row.product_name ? ` · ${row.product_name}` : ''}
                      {row.triage_score != null ? ` · ${row.triage_score}/10` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {row.status}
                  </span>
                  {isReviewable && (
                    <Link href={`/review/${row.campaign_id}`} style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                      Review
                    </Link>
                  )}
                </div>
              )
            })}
            {recent.length === 0 && pending.length === 0 && (
              <p style={{ color: 'rgba(240,239,248,0.25)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                No leads yet — trigger a scrape run to begin
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 9px', borderRadius: 999,
      background: accent ? 'rgba(99,102,241,0.15)' : 'rgba(240,239,248,0.07)',
      color: accent ? '#818cf8' : 'rgba(240,239,248,0.5)',
    }}>
      {children}
    </span>
  )
}
