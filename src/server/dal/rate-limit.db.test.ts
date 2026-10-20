import { describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { getDb } from '../db/client'
import { rateLimit } from '../db/schema'
import { like } from 'drizzle-orm'
import { deleteAccount } from './account'
import { clearRateLimits, consumeRateLimit, RateLimitError, USER_LIMITS } from './rate-limit'

describe('Rate-Limit je Nutzer', () => {
  it('sperrt nach der Grenze, nur für diesen Nutzer und diese Aktion, im nächsten Fenster wieder frei', async () => {
    const alice = await createUser('Alice')
    const bob = await createUser('Bob')
    const t0 = Date.UTC(2026, 9, 20, 12)
    for (let i = 0; i < USER_LIMITS.restore.max; i++) await consumeRateLimit(alice, 'restore', t0 + i)
    const error = await consumeRateLimit(alice, 'restore', t0 + 60_000).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as RateLimitError).retryAfterSeconds).toBeCloseTo(3540, 0)
    expect((error as RateLimitError).message).toMatch(/in 59 Minuten/)
    // andere Aktion und anderer Nutzer unberührt
    await expect(consumeRateLimit(alice, 'export', t0)).resolves.toBeUndefined()
    await expect(consumeRateLimit(bob, 'restore', t0)).resolves.toBeUndefined()
    // neues Fenster
    await expect(consumeRateLimit(alice, 'restore', t0 + 3_600_000)).resolves.toBeUndefined()
    await clearRateLimits(alice.id)
    await clearRateLimits(bob.id)
  })

  it('gleichzeitige Aufrufe zählen exakt (atomares Upsert)', async () => {
    const carol = await createUser('Carol')
    const now = Date.now()
    const results = await Promise.allSettled(Array.from({ length: USER_LIMITS.share.max + 5 }, () => consumeRateLimit(carol, 'share', now)))
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5)
    await clearRateLimits(carol.id)
  })

  it('Konto löschen entfernt die Zähler', async () => {
    const dave = await createUser('Dave')
    await consumeRateLimit(dave, 'write')
    expect(await getDb().select().from(rateLimit).where(like(rateLimit.key, `rt100k:%:${dave.id}`))).toHaveLength(1)
    await deleteAccount(dave)
    expect(await getDb().select().from(rateLimit).where(like(rateLimit.key, `rt100k:%:${dave.id}`))).toEqual([])
  })
})
