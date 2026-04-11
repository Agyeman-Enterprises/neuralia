import { createClient } from '@supabase/supabase-js'

// Neuralia Supabase project — uses service role key for full access
const url = 'https://xxdisgtbkfrhfutxlwid.supabase.co'
const key = process.env.NEURALIA_SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.CF_SUPABASE_SERVICE_ROLE_KEY
  ?? ''

const supabase = createClient(url, key)

/**
 * Execute raw SQL via Supabase RPC (exec_sql function).
 * Drop-in replacement for pg Pool.query() — returns rows as array.
 * Parameterized queries: replaces $1,$2 etc with values before sending.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  let resolved = sql.trim()

  // Replace $N placeholders with escaped values
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

  // For SELECT queries, use exec_sql RPC
  const isSelect = /^\s*(SELECT|WITH)\b/i.test(resolved)
  if (isSelect) {
    const { data, error } = await supabase.rpc('exec_sql', { query: resolved })
    if (error) throw new Error(`DB query failed: ${error.message}`)
    return (data ?? []) as T[]
  }

  // For INSERT/UPDATE/DELETE, use exec_sql but don't expect rows
  const { data, error } = await supabase.rpc('exec_sql', { query: resolved })
  if (error) throw new Error(`DB exec failed: ${error.message}`)
  // For INSERT...RETURNING, data will have the rows
  return (Array.isArray(data) ? data : []) as T[]
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

// db.query() wraps raw SQL for backwards compat with old pg-style code
// Also exposes supabase client for direct table operations
export const db = Object.assign(supabase, { query: (sql: string, params?: unknown[]) => query(sql, params) })
export { supabase }
