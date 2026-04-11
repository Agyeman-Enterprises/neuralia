import { Pool } from 'pg'
import tls from 'tls'

// Supabase pooler uses certs that pg's default verify-full rejects.
// Use a custom TLS context that connects over TLS but skips CA verification,
// matching sslmode=require behavior (encrypted, not CA-verified).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { secureContext: tls.createSecureContext(), checkServerIdentity: () => undefined }
    : false,
  max: 5,
  idleTimeoutMillis: 30000,
})

export const db = pool

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
