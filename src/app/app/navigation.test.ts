import { describe, expect, it } from 'vitest'
import { fabTarget, initials, isActive, quickAddTarget, underPath } from '@/components/shell/nav'
import { accountLinks, appNav, NOTICES_LINK, QUICK_ADD_HREF } from './navigation'

const DEPOT = '0f8b6c1e-2d3a-4b5c-9d7e-112233445566'

/** Welche Einträge der Hauptnavigation sind auf `path` aktiv? */
const activeLabels = (path: string) =>
  appNav()
    .filter((item) => isActive(path, item))
    .map((item) => item.label)

describe('aktive Seite in der Navigation', () => {
  it('Übersicht nur auf /app selbst', () => {
    expect(activeLabels('/app')).toEqual(['Übersicht'])
    expect(activeLabels('/app/depots')).not.toContain('Übersicht')
  })

  it('Depots auch für Depot-, Buchungs-, Wertpapier- und geteilte Seiten', () => {
    for (const path of ['/app/depots', `/app/depots/${DEPOT}`, `/app/depots/${DEPOT}/buchung/abc`, '/app/depots/neu', `/app/wertpapier/${DEPOT}`, `/app/geteilt/${DEPOT}`, '/app/freigabe/token']) {
      expect(activeLabels(path), path).toEqual(['Depots'])
    }
  })

  it('Unterseiten von Steuer, Road, Import und Rückblick', () => {
    expect(activeLabels('/app/steuer/export')).toEqual(['Steuer'])
    expect(activeLabels('/app/road')).toEqual(['Road to 100k'])
    expect(activeLabels('/app/import')).toEqual(['Import'])
    expect(activeLabels('/app/rueckblick/2026-09')).toEqual(['Monatsrückblick'])
  })

  it('beachtet Segmentgrenzen', () => {
    expect(underPath('/app/depotsx', '/app/depots')).toBe(false)
    expect(underPath('/app/depots/', '/app/depots')).toBe(true)
    expect(activeLabels('/app/steuerberater')).toEqual([])
  })

  it('Seiten mit eigenem Platz in der Kopfzeile markieren keinen Navigationspunkt', () => {
    for (const path of ['/app/hinweise', '/app/sicherheit', '/app/konto/export', '/app/admin', '/app/buchen']) {
      expect(activeLabels(path), path).toEqual([])
    }
  })

  it('Glocke und Konto-Menü kennen ihre Seiten', () => {
    expect(isActive('/app/hinweise', NOTICES_LINK)).toBe(true)
    expect(isActive('/app', NOTICES_LINK)).toBe(false)
    const [security, admin] = accountLinks(true)
    expect(isActive('/app/konto/wiederherstellen', security!)).toBe(true)
    expect(isActive('/app/admin', admin!)).toBe(true)
    expect(accountLinks(false).map((l) => l.label)).toEqual(['Konto und Sicherheit'])
  })

  it('Mehr enthält nur Seiten, die nicht schon oben bzw. in der Leiste stehen', () => {
    expect(
      appNav()
        .filter((i) => !i.primary)
        .map((i) => i.label),
    ).toEqual(['Import', 'Monatsrückblick'])
    expect(
      appNav()
        .filter((i) => !i.tab)
        .map((i) => i.label),
    ).toEqual(['Steuer', 'Import', 'Monatsrückblick'])
  })
})

describe('Neue Buchung', () => {
  it('wählt im Depot dieses Depot vor – auch beim Bearbeiten einer Buchung', () => {
    expect(quickAddTarget(`/app/depots/${DEPOT}`, QUICK_ADD_HREF)).toBe(`/app/buchen?depot=${DEPOT}`)
    expect(quickAddTarget(`/app/depots/${DEPOT}/buchung/xyz`, QUICK_ADD_HREF)).toBe(`/app/buchen?depot=${DEPOT}`)
    expect(quickAddTarget('/app/analyse', QUICK_ADD_HREF)).toBe('/app/buchen')
  })

  it('nicht auf der Erfassungsseite selbst', () => {
    expect(quickAddTarget('/app/buchen', QUICK_ADD_HREF)).toBeNull()
    expect(quickAddTarget('/app/buchen/x', QUICK_ADD_HREF)).toBeNull()
    expect(quickAddTarget('/app/buchenx', QUICK_ADD_HREF)).toBe('/app/buchen')
    expect(quickAddTarget('/app', undefined)).toBeNull()
  })

  it('„+“ am Handy nicht über Formularen und beim Bearbeiten', () => {
    for (const path of ['/app/depots/neu', `/app/depots/${DEPOT}/buchung/xyz`, '/app/import', '/app/sicherheit', '/app/konto/export', '/app/admin', '/app/hinweise', '/app/road', '/app/buchen']) {
      expect(fabTarget(path, QUICK_ADD_HREF), path).toBeNull()
    }
    expect(fabTarget(`/app/depots/${DEPOT}`, QUICK_ADD_HREF)).toBe(`/app/buchen?depot=${DEPOT}`)
    expect(fabTarget('/app/depots', QUICK_ADD_HREF)).toBe('/app/buchen')
    expect(fabTarget('/app/importe', QUICK_ADD_HREF)).toBe('/app/buchen')
  })
})

describe('Initialen', () => {
  it('erster und letzter Name', () => {
    expect(initials('Erika Muster')).toBe('EM')
    expect(initials('anna maria berger')).toBe('AB')
    expect(initials('Özge')).toBe('Ö')
    expect(initials('  ')).toBe('')
  })

  it('fällt auf die E-Mail zurück', () => {
    expect(initials('', 'test@example.org')).toBe('T')
    expect(initials('***', 'x@example.org')).toBe('X')
  })
})
