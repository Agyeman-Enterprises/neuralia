'use client'

import { useEffect, useState, useCallback } from 'react'

interface DashRow {
  id: string
  source: string
  subreddit: string | null
  title: string
  triage_score: number | null
  status: string
  matched_product_id: string | null
  product_name: string | null
  campaign_id: string | null
  campaign_status: string | null
  campaign_priority: number
}

type Tab = 'review' | 'approved' | 'provisional' | 'rejected' | 'posted' | 'all'
type SortKey = 'triage_score' | 'status' | 'source' | 'campaign_priority'
type SortDir = 'asc' | 'desc'

const TAB_FILTERS: Record<Tab, (r: DashRow) => boolean> = {
  review:      r => r.status === 'pending_approval' || r.campaign_status === 'draft',
  approved:    r => r.status === 'approved' || r.campaign_status === 'approved',
  provisional: r => r.status === 'provisional',
  rejected:    r => r.status === 'rejected' && r.campaign_status === 'rejected',
  posted:      r => r.status === 'posted',
  all:         () => true,
}

const TAB_LABELS: Record<Tab, string> = {
  review: 'Needs Review',
  approved: 'Approved',
  provisional: 'Provisional',
  rejected: 'Rejected',
  posted: 'Posted',
  all: 'All',
}

const STATUS_COLOR: Record<string, string> = {
  raw: '#475569', triaged: '#7c3aed', generating: '#d97706',
  pending_approval: '#f59e0b', provisional: '#8b5cf6',
  approved: '#22c55e', posted: '#10b981',
  rejected: '#ef4444', failed: '#dc2626', draft: '#3b82f6',
}

export default function Dashboard() {
  const [leads, setLeads] = useState<DashRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('review')
  const [sortKey, setSortKey] = useState<SortKey>('triage_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [working, setWorking] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.ok) setLeads(d.leads ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  // Reload when user returns to this tab (e.g. after reviewing a campaign)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const restore = useCallback(async (campaignId: string) => {
    setWorking(campaignId)
    await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    })
    setWorking(null)
    reload()
  }, [reload])

  const setPriority = useCallback(async (campaignId: string, priority: number) => {
    setWorking(campaignId)
    await fetch('/api/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, priority }),
    })
    setWorking(null)
    reload()
  }, [reload])

  const counts: Record<Tab, number> = {
    review:      leads.filter(TAB_FILTERS.review).length,
    approved:    leads.filter(TAB_FILTERS.approved).length,
    provisional: leads.filter(TAB_FILTERS.provisional).length,
    rejected:    leads.filter(TAB_FILTERS.rejected).length,
    posted:      leads.filter(TAB_FILTERS.posted).length,
    all:         leads.length,
  }

  const visible = leads
    .filter(TAB_FILTERS[tab])
    .sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortKey === 'triage_score') { va = a.triage_score ?? -1; vb = b.triage_score ?? -1 }
      else if (sortKey === 'campaign_priority') { va = a.campaign_priority; vb = b.campaign_priority }
      else if (sortKey === 'source') { va = a.source; vb = b.source }
      else { va = a.status; vb = b.status }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1280, margin: '0 auto', padding: 24, background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Neuralia</h1>
        <button onClick={reload} disabled={loading} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
      </div>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 13 }}>Autonomous content organism — scrape → triage → generate → approve → publish</p>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {([
          { label: 'Needs Review', value: counts.review, color: '#f59e0b', t: 'review' as Tab },
          { label: 'Provisional', value: counts.provisional, color: '#8b5cf6', t: 'provisional' as Tab },
          { label: 'Approved', value: counts.approved, color: '#22c55e', t: 'approved' as Tab },
          { label: 'Posted', value: counts.posted, color: '#10b981', t: 'posted' as Tab },
          { label: 'Rejected', value: counts.rejected, color: '#ef4444', t: 'rejected' as Tab },
        ]).map(s => (
          <div
            key={s.label}
            onClick={() => setTab(s.t)}
            style={{
              background: tab === s.t ? '#1e293b' : '#131c2b', borderRadius: 10, padding: '12px 18px', flex: '1 1 120px',
              cursor: 'pointer', border: tab === s.t ? `1px solid ${s.color}55` : '1px solid #1e293b',
              transition: 'border 0.15s',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{loading ? '…' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', color: tab === t ? '#f1f5f9' : '#64748b',
              fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: 'pointer',
              padding: '8px 14px', borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {TAB_LABELS[t]}{counts[t] > 0 ? ` (${counts[t]})` : ''}
          </button>
        ))}
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
            <th style={th} onClick={() => handleSort('source')} title="Sort by source">
              Source <SortIcon k="source" />
            </th>
            <th style={{ ...th, width: '38%' }}>Lead</th>
            <th style={th}>Product</th>
            <th style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('triage_score')} title="Sort by score">
              Score <SortIcon k="triage_score" />
            </th>
            <th style={th}>Status</th>
            {tab === 'approved' && (
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('campaign_priority')} title="Sort by priority">
                Priority <SortIcon k="campaign_priority" />
              </th>
            )}
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid #0f172a' }}>
              <td style={td}>{l.source}{l.subreddit ? ` · r/${l.subreddit}` : ''}</td>
              <td style={td}>
                {l.campaign_id ? (
                  <a href={`/review/${l.campaign_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                    {l.title ?? '(no title)'}
                  </a>
                ) : (l.title ?? '(no title)')}
              </td>
              <td style={{ ...td, color: '#94a3b8' }}>{l.product_name ?? l.matched_product_id ?? '—'}</td>
              <td style={{ ...td, color: scoreColor(l.triage_score), fontWeight: 600 }}>{l.triage_score ?? '—'}</td>
              <td style={td}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: STATUS_COLOR[l.campaign_status ?? l.status] ?? '#475569', color: '#fff' }}>
                  {l.campaign_status ?? l.status}
                </span>
              </td>
              {tab === 'approved' && (
                <td style={td}>
                  {l.campaign_id && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        style={btnSmall('#334155')}
                        disabled={working === l.campaign_id}
                        onClick={() => setPriority(l.campaign_id!, Math.max(0, l.campaign_priority - 1))}
                        title="Lower priority"
                      >↓</button>
                      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600, color: l.campaign_priority > 0 ? '#f59e0b' : '#475569' }}>
                        {l.campaign_priority}
                      </span>
                      <button
                        style={btnSmall('#334155')}
                        disabled={working === l.campaign_id}
                        onClick={() => setPriority(l.campaign_id!, l.campaign_priority + 1)}
                        title="Raise priority"
                      >↑</button>
                    </div>
                  )}
                </td>
              )}
              <td style={td}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {l.campaign_id && (
                    <a href={`/review/${l.campaign_id}`} style={{ ...btnSmall('#334155'), textDecoration: 'none', display: 'inline-block' }}>
                      Review
                    </a>
                  )}
                  {l.campaign_id && (l.status === 'rejected' || l.status === 'provisional' || l.campaign_status === 'rejected') && (
                    <button
                      style={btnSmall('#7c3aed')}
                      disabled={working === l.campaign_id}
                      onClick={() => restore(l.campaign_id!)}
                      title="Move back to draft for review"
                    >
                      {working === l.campaign_id ? '…' : 'Restore'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!loading && visible.length === 0 && (
            <tr>
              <td colSpan={tab === 'approved' ? 7 : 6} style={{ padding: 32, textAlign: 'center', color: '#475569' }}>
                {tab === 'review' ? 'No posts waiting for review.' :
                 tab === 'provisional' ? 'No provisional posts — low-score leads land here. Use Restore to send one to review.' :
                 tab === 'rejected' ? 'Nothing rejected.' :
                 'Nothing here yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading…</div>
      )}
    </main>
  )
}

function scoreColor(score: number | null) {
  if (!score) return '#64748b'
  if (score >= 8) return '#4ade80'
  if (score >= 6) return '#fbbf24'
  return '#f87171'
}

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const btnSmall = (bg: string): React.CSSProperties => ({
  background: bg, color: '#e2e8f0', border: 'none', borderRadius: 6,
  padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
})
