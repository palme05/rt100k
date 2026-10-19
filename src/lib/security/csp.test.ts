import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, generateNonce } from './csp'

describe('generateNonce', () => {
  it('erzeugt 128 Bit Zufall, base64-kodiert und nie doppelt', () => {
    const nonces = new Set(Array.from({ length: 1000 }, generateNonce))
    expect(nonces.size).toBe(1000)
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16)
  })
})

describe('buildContentSecurityPolicy', () => {
  const prod = buildContentSecurityPolicy('abc', { isDev: false })

  it('erlaubt Skripte nur per Nonce', () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(prod).not.toContain('unsafe-inline')
    expect(prod).not.toContain('unsafe-eval')
  })

  it('verbietet Einbettung in Frames und Plugins', () => {
    expect(prod).toContain("frame-ancestors 'none'")
    expect(prod).toContain("object-src 'none'")
    expect(prod).toContain('upgrade-insecure-requests')
  })

  it('lockert nur in der Entwicklung für React-Debugging', () => {
    const dev = buildContentSecurityPolicy('abc', { isDev: true })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).not.toContain('upgrade-insecure-requests')
  })
})
