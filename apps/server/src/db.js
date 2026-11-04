import 'dotenv/config'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL (cadena de conexión de Neon). Revisa apps/server/.env')
  process.exit(1)
}

// Neon exige SSL: ya viene en la cadena (?sslmode=require). Para Vercel/serverless usa la cadena "pooled" de Neon.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL) || 5 })
pool.on('error', (e) => console.error('Error en conexión inactiva de la base de datos:', e.message))

/** Ejecuta fn(client) dentro de una transacción. Si fn lanza, se deshace todo. */
export async function tx(fn) {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    try { await c.query('ROLLBACK') } catch { /* conexión ya cerrada */ }
    throw e
  } finally { c.release() }
}
