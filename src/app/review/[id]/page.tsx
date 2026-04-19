'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface ReviewData {
  lead: {
    id: string; source: string; source_url: string | null; title: string;
    body: string | null; author: string | null; subreddit: string | null;
    score: number | null; triage_score: number | null; triage_rationale: string | null;
  }
  campaign: {
    id: string; title: string; dek: string | null; body: string;
    status: string; created_at: string;
  }
  product: {
    id: string; name: string; class: string; niche: string; medium_pub: string | null;
  }
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editedBody, setEditedBody] = useState('')
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/review/${id}`)
      .then(r => r.json())
      .then((d: ReviewData) => {
        setData(d)
        setEditedBody(d.campaign.body)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load content'); setLoading(false) })
  }, [id])

  const approve = useCallback(async () => {
    if (!data) return
    setWorking(true)
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: data.campaign.id,
          edits_body: editedBody !== data.campaign.body ? editedBody : undefined,
          approved_by: 'human-dashboard',
        }),
      })
      const json = await res.json() as { posted?: string[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Approve failed')
      setDone(`✅ Posted to: ${json.posted?.join(', ') || 'no channels (set tokens)'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setWorking(false)
    }
  }, [data, editedBody])

  const reject = useCallback(async () => {
    if (!data) return
    setWorking(true)
    try {
      const reason = prompt('Rejection reason (optional):') ?? 'Human rejected'
      const res = await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: data.campaign.id, reason }),
      })
      if (!res.ok) throw new Error('Reject failed')
      setDone('❌ Campaign rejected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setWorking(false)
    }
  }, [data])

  const restore = useCallback(async () => {
    if (!data) return
    setWorking(true)
    try {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: data.campaign.id }),
      })
      if (!res.ok) throw new Error('Restore failed')
      // Reload with updated status
      const updated = await fetch(`/api/review/${id}`).then(r => r.json()) as ReviewData
      setData(updated)
      setEditedBody(updated.campaign.body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setWorking(false)
    }
  }, [data, id])

  if (loading) return (
    <div style={styles.shell}>
      <div style={styles.spinner} />
      <p style={styles.dim}>Loading campaign…</p>
    </div>
  )

  if (error && !data) return (
    <div style={styles.shell}>
      <p style={{ color: '#f87171' }}>{error}</p>
      <button style={styles.btnBack} onClick={() => router.push('/')}>← Dashboard</button>
    </div>
  )

  if (!data) return null

  const scoreColor = !data.lead.triage_score ? '#6b7280'
    : data.lead.triage_score >= 8 ? '#4ade80'
    : data.lead.triage_score >= 6 ? '#fbbf24'
    : '#f87171'

  return (
    <div style={styles.shell}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <button style={styles.btnBack} onClick={() => router.push('/')}>← Dashboard</button>
          <h1 style={styles.h1}>Content Review</h1>
        </div>
        <span style={{ ...styles.badge, background: `${scoreColor}22`, color: scoreColor }}>
          Score {data.lead.triage_score ?? '?'}/10
        </span>
      </header>

      {/* Lead context */}
      <section style={styles.card}>
        <h2 style={styles.h2}>📡 Lead Source</h2>
        <div style={styles.metaRow}>
          <span style={styles.tag}>{data.lead.source}{data.lead.subreddit ? ` · r/${data.lead.subreddit}` : ''}</span>
          {data.lead.score != null && <span style={styles.dim}>↑{data.lead.score}</span>}
          {data.lead.author && <span style={styles.dim}>@{data.lead.author}</span>}
        </div>
        <p style={styles.leadTitle}>{data.lead.title}</p>
        {data.lead.body && (
          <p style={styles.leadBody}>{data.lead.body.slice(0, 400)}{data.lead.body.length > 400 ? '…' : ''}</p>
        )}
        {data.lead.triage_rationale && (
          <p style={styles.rationale}>🧠 {data.lead.triage_rationale}</p>
        )}
        {data.lead.source_url && (
          <a href={data.lead.source_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
            View original →
          </a>
        )}
      </section>

      {/* Product */}
      <section style={styles.card}>
        <h2 style={styles.h2}>🎯 Matched Product</h2>
        <div style={styles.metaRow}>
          <span style={{ ...styles.tag, background: '#6366f122', color: '#818cf8' }}>
            {data.product.name}
          </span>
          <span style={styles.dim}>{data.product.class} · {data.product.niche}</span>
        </div>
      </section>

      {/* Draft content */}
      <section style={styles.card}>
        <h2 style={styles.h2}>✍️ Generated Content</h2>
        <p style={styles.contentTitle}>{data.campaign.title}</p>
        {data.campaign.dek && <p style={styles.dek}>{data.campaign.dek}</p>}
        <label style={styles.label}>Content body — edit freely before approving</label>
        <textarea
          style={styles.textarea}
          value={editedBody}
          onChange={e => setEditedBody(e.target.value)}
          rows={24}
          disabled={working || !!done}
        />
      </section>

      {/* Actions */}
      {!done ? (
        <div style={styles.actions}>
          {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          {['rejected', 'provisional'].includes(data.campaign.status) && (
            <button style={styles.btnRestore} onClick={restore} disabled={working} title="Move back to draft for fresh review">
              {working ? '…' : '↩ Restore to Draft'}
            </button>
          )}
          {data.campaign.status !== 'rejected' && (
            <button style={styles.btnReject} onClick={reject} disabled={working}>
              {working ? '…' : '✕ Reject'}
            </button>
          )}
          <button style={styles.btnApprove} onClick={approve} disabled={working}>
            {working ? 'Posting…' : data.campaign.status === 'rejected' ? '↩ Override & Post' : '✓ Approve & Post'}
          </button>
        </div>
      ) : (
        <div style={styles.doneBar}>
          <p style={{ color: '#4ade80', margin: 0 }}>{done}</p>
          <button style={styles.btnBack} onClick={() => router.push('/')}>← Back to dashboard</button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh', background: '#0e0e12', color: '#f0eff8',
    fontFamily: "'Inter', system-ui, sans-serif", padding: '24px 20px', maxWidth: 760, margin: '0 auto',
  },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, margin: '8px 0 0' },
  h2: { fontSize: 14, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' },
  card: { background: '#16161c', border: '1px solid rgba(240,239,248,0.09)', borderRadius: 16, padding: 20, marginBottom: 16 },
  metaRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, marginBottom: 10 },
  tag: { fontSize: 12, padding: '3px 10px', borderRadius: 999, background: 'rgba(240,239,248,0.07)', color: '#94a3b8' },
  badge: { fontSize: 14, fontWeight: 700, padding: '4px 14px', borderRadius: 999 },
  dim: { fontSize: 13, color: 'rgba(240,239,248,0.4)' },
  leadTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.4 },
  leadBody: { fontSize: 13, color: 'rgba(240,239,248,0.6)', lineHeight: 1.6, margin: '0 0 10px' },
  rationale: { fontSize: 13, color: '#a78bfa', fontStyle: 'italic', margin: '8px 0 0' },
  link: { fontSize: 13, color: '#6366f1', textDecoration: 'none' },
  contentTitle: { fontSize: 20, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.3 },
  dek: { fontSize: 14, color: 'rgba(240,239,248,0.55)', fontStyle: 'italic', margin: '0 0 16px' },
  label: { fontSize: 12, color: 'rgba(240,239,248,0.4)', display: 'block', marginBottom: 8 },
  textarea: {
    width: '100%', background: '#0e0e12', border: '1px solid rgba(240,239,248,0.12)',
    borderRadius: 10, color: '#f0eff8', fontSize: 13, lineHeight: 1.7,
    padding: '14px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  },
  actions: { display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center', padding: '16px 0' },
  btnApprove: {
    background: '#22c55e', color: '#0a0a0a', border: 'none', borderRadius: 12,
    padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  btnReject: {
    background: 'transparent', color: '#f87171', border: '1px solid #f8717155',
    borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  btnRestore: {
    background: 'transparent', color: '#a78bfa', border: '1px solid #a78bfa55',
    borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  btnBack: {
    background: 'transparent', color: 'rgba(240,239,248,0.4)', border: 'none',
    fontSize: 13, cursor: 'pointer', padding: 0,
  },
  spinner: {
    width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)',
    borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '80px auto 16px',
  },
  doneBar: { display: 'flex', gap: 20, alignItems: 'center', padding: '20px 0' },
}
