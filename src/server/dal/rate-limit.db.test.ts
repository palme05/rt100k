import { describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { rateLimit, userRateLimit } from '../db/schema'
import { deleteAccount } from './account'
import { consumeRateLimit, RateLimitError, USER_LIMITS } from './rate-limit'

describe('Rate-Limit je Nutzer', () => {
  it('sperrt nach der Grenze, nur für diesen Nutzer und diese Aktion, im nächsten Fenster wieder frei', async () => {
    const alice = await createUser('Alice')
    const bob = await createUser('Bob')
    const t0 = Date.UTC(2026, 9, 20, 12)
    for (let i = 0; i < USER_LIMITS.restore.max; i++) await consumeRateLimit(alice, 'restore', new Date(t0 + i))
    const error = await consumeRateLimit(alice, 'restore', new Date(t0 + 60_000)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as RateLimitError).retryAfterSeconds).toBeCloseTo(3540, 0)
    expect((error as RateLimitError).message).toMatch(/in 59 Minuten/)
    // andere Aktion und anderer Nutzer unberührt
    await expect(consumeRateLimit(alice, 'export', new Date(t0))).resolves.toBeUndefined()
    await expect(consumeRateLimit(bob, 'restore', new Date(t0))).resolves.toBeUndefined()
    // Better Auth räumt `rate_limit` ab – die Zähler je Nutzer bleiben
    await getDb().delete(rateLimit)
    await expect(consumeRateLimit(alice, 'restore', new Date(t0 + 120_000))).rejects.toBeInstanceOf(RateLimitError)
    // neues Fenster
    await expect(consumeRateLimit(alice, 'restore', new Date(t0 + 3_600_000))).resolves.toBeUndefined()
  })

  it('gleichzeitige Aufrufe zählen exakt (atomares Upsert)', async () => {
    const carol = await createUser('Carol')
    const now = new Date()
    const results = await Promise.allSettled(Array.from({ length: USER_LIMITS.share.max + 5 }, () => consumeRateLimit(carol, 'share', now)))
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5)
  })

  it('Zähler sind nur für den eigenen Nutzer sichtbar und verschwinden mit dem Konto', async () => {
    const dave = await createUser('Dave')
    const erin = await createUser('Erin')
    await consumeRateLimit(dave, 'write')
    expect(await withUser(dave.id, (tx) => tx.select().from(userRateLimit))).toHaveLength(1)
    expect(await withUser(erin.id, (tx) => tx.select().from(userRateLimit))).toEqual([])
    expect(await getDb().select().from(userRateLimit)).toEqual([])
    // fremde owner_id nicht schreibbar
    await expect(withUser(erin.id, (tx) => tx.insert(userRateLimit).values({ ownerId: dave.id, action: 'export', count: 999, windowStart: new Date() }))).rejects.toThrow()
    await deleteAccount(dave)
    expect(await withUser(dave.id, (tx) => tx.select().from(userRateLimit))).toEqual([])
  })
})
