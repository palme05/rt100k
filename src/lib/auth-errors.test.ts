import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './auth-errors'

describe('authErrorMessage', () => {
  it('übersetzt bekannte Codes', () => {
    expect(authErrorMessage({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('E-Mail oder Passwort stimmt nicht.')
    expect(authErrorMessage({ status: 400, code: 'INVALID_CODE' })).toMatch(/Code stimmt nicht/)
  })

  it('reicht eigene deutsche Sperr-Meldungen durch, englische nicht', () => {
    expect(authErrorMessage({ status: 429, message: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' })).toMatch(/15 Minuten/)
    expect(authErrorMessage({ status: 429, message: 'Too many requests' })).toMatch(/kurz warten/)
  })

  it('verrät bei unbekannten Fehlern nichts', () => {
    expect(authErrorMessage({ status: 500, message: 'relation "user" does not exist' })).toBe('Das hat nicht geklappt. Bitte erneut versuchen.')
  })
})
