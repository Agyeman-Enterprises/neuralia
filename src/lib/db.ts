import { createClient } from '@supabase/supabase-js'

// Use Supabase JS client + exec_sql RPC — no pg pooler password needed.
// The exec_sql function (SETOF json, SECURITY DEFINER) is deployed on the DB.
const url = 'https://xxdisgtbkfrhfutxlwid.supabase.co'
const key = process.env.NEURALIA_SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.CF_SUPABASE_SERVICE_ROLE_KEY
  ?? ''

const supabase = createClient(url, key)

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  let resolved = sql.trim()

  // Replace $N placeholders with escaped values (descending to avoid $1 matching $10)
  if (params) {
    for (let i = params.length; i >= 1; i--) {
      const val = params[i - 1]
      let replacement: string
      if (val === null || val === undefined) {
        replacement = 'NULL'
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        replacement = String(val)
      } else if (Array.isArray(val)) {
        const items = val.map(v =>
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v)
        ).join(',')
        replacement = `ARRAY[${items}]`
      } else {
        replacement = `'${String(val).replace(/'/g, "''")}'`
      }
      resolved = resolved.replaceAll(`$${i}`, replacement)
    }
  }

  const isSelect = /^\s*(SELECT|WITH)\b/i.test(resolved)

  if (isSelect) {
    const { data, error } = await supabase.rpc('exec_sql', { query: resolved })
    if (error) throw new Error(`DB query failed: ${error.message}`)
    return (data ?? []) as T[]
  }

  // For INSERT/UPDATE/DELETE — exec_sql handles RETURNING automatically
  const { data, error } = await supabase.rpc('exec_sql', { query: resolved })
  if (error) throw new Error(`DB exec failed: ${error.message}`)
  return (Array.isArray(data) ? data : []) as T[]
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export const db = { query: (sql: string, params?: unknown[]) => query(sql, params) }
export { supabase }
