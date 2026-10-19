import { describe, expect, it } from 'vitest'
import { isAuthorizedCron } from './daily'

const secret = 'a'.repeat(43)

describe('isAuthorizedCron', () => {
  it('nur mit exakt passendem Bearer-Secret', () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true)
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false)
    expect(isAuthorizedCron(secret, secret)).toBe(false)
    expect(isAuthorizedCron(null, secret)).toBe(false)
  })

  it('ohne oder mit zu kurzem Secret ist der Endpunkt zu', () => {
    expect(isAuthorizedCron('Bearer ', undefined)).toBe(false)
    expect(isAuthorizedCron('Bearer kurz', 'kurz')).toBe(false)
  })
})
