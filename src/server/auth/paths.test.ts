import { describe, expect, it } from 'vitest'
import { isAllowedAuthPath } from './paths'

describe('Auth-Pfade', () => {
  it('lässt nur genutzte Endpunkte durch', () => {
    expect(isAllowedAuthPath('/api/auth/sign-in/email')).toBe(true)
    expect(isAllowedAuthPath('/api/auth/passkey/verify-authentication')).toBe(true)
    expect(isAllowedAuthPath('/api/auth/two-factor/verify-totp/')).toBe(true)
    for (const p of ['/api/auth/update-user', '/api/auth/list-sessions', '/api/auth/revoke-session', '/api/auth/two-factor/get-totp-uri', '/api/auth/sign-up/email', '/api/auth/', '/api/auth/sign-in/email/../update-user', '/api/authx/sign-out', '/sign-in/email']) {
      expect(isAllowedAuthPath(p), p).toBe(false)
    }
  })
})
