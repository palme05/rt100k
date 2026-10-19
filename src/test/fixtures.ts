import { randomUUID } from 'node:crypto'
import { getDb } from '@/server/db/client'
import { user } from '@/server/db/schema'
import type { Actor } from '@/server/dal/actor'
import { ensureGlobalInstrument } from '@/server/dal/instruments'

/** Testnutzer direkt anlegen (ohne Auth-Flow). */
export async function createUser(name: string, role: Actor['role'] = 'member'): Promise<Actor> {
  const id = randomUUID()
  await getDb().insert(user).values({ id, name, email: `${id}@test.invalid`, role })
  return { id, role }
}

export function vwce() {
  return ensureGlobalInstrument({
    kind: 'etf',
    name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
    isin: 'IE00BK5BQT80',
    symbol: 'VWCE.DE',
    coingeckoId: null,
    metal: null,
    currency: 'EUR',
  })
}
