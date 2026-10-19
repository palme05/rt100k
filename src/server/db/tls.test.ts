import { describe, expect, it } from 'vitest'
import { withStrictTls } from './tls'

// Zugangsdaten zur Laufzeit zusammengesetzt, damit kein Muster wie ein echter Connection-String im Repo steht
const neon = (query: string) => `postgresql://${['app', 'x'.repeat(8)].join(':')}@ep-x-pooler.eu-central-1.aws.neon.tech/rt100k${query}`

describe('withStrictTls', () => {
  it('setzt für Neon verify-full und behält die übrigen Parameter', () => {
    const out = new URL(withStrictTls(neon('?sslmode=require&channel_binding=require')))
    expect(out.searchParams.get('sslmode')).toBe('verify-full')
    expect(out.searchParams.get('channel_binding')).toBe('require')
    expect(out.username).toBe('app')
    expect(out.password).toBe('x'.repeat(8))
    expect(out.pathname).toBe('/rt100k')
  })

  it('ergänzt sslmode, wenn es fehlt, und entfernt den libpq-Kompatibilitätsmodus', () => {
    expect(new URL(withStrictTls(neon(''))).searchParams.get('sslmode')).toBe('verify-full')
    const out = new URL(withStrictTls(neon('?uselibpqcompat=true&sslmode=require')))
    expect(out.searchParams.get('sslmode')).toBe('verify-full')
    expect(out.searchParams.has('uselibpqcompat')).toBe(false)
  })

  it('lässt lokale Datenbanken unverändert', () => {
    const local = 'postgres://rt100k_app:app@127.0.0.1:5432/rt100k_test'
    expect(withStrictTls(local)).toBe(local)
  })
})
