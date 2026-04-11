'use client'

import { useEffect, useState } from 'react'

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
}

const STATUS_COLOR: Record<string, string> = {
  raw: '#475569', triaged: '#7c3aed', generating: '#d97706',
  pending_approval: '#f59e0b', approved: '#22c55e', posted: '#10b981',
  rejected: '#ef4444', failed: '#dc2626',
}

export default function Dashboard() {
  const [leads, setLeads] = useState<DashRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.ok) setLeads(d.leads ?? d.sample ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const total = leads.length
  const pending = leads.filter(l => l.status === 'pending_approval').length
  const posted = leads.filter(l => l.status === 'posted').length
  const rejected = leads.filter(l => l.status === 'rejected').length

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24, background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Neuralia</h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>Autonomous content organism — scrape → triage → generate → approve → publish</p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Leads', value: total },
          { label: 'Pending', value: pending, color: '#f59e0b' },
          { label: 'Posted', value: posted, color: '#10b981' },
          { label: 'Rejected', value: rejected, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 20px', flex: 1 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color ?? '#e2e8f0' }}>{loading ? '...' : s.value}</div>
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
          {leads.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{l.source}{l.subreddit ? ` (${l.subreddit})` : ''}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>
                {l.campaign_id ? (
                  <a href={`/review/${l.campaign_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>{l.title}</a>
                ) : l.title}
              </td>
              <td style={{ padding: '8px 12px', fontSize: 13, color: '#94a3b8' }}>{l.product_name ?? l.matched_product_id ?? '—'}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{l.triage_score ?? '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: STATUS_COLOR[l.status] ?? '#475569', color: '#fff' }}>
                  {l.status}
                </span>
              </td>
            </tr>
          ))}
          {!loading && leads.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No leads yet. Crons run daily at 8pm UTC.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
