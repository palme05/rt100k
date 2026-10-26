/**
 * Geführter Start: abgeleitete Schritte für neue Nutzer – nichts wird dafür
 * gespeichert, jeder Schritt gilt als erledigt, sobald es die Daten zeigen.
 * Reine Funktion; Ausblenden merkt sich das Gerät (Cookie).
 */

export interface StartState {
  portfolios: number
  bookings: number
  /** eigene Annahmen gespeichert oder ein eigenes Ziel angelegt */
  planned: boolean
  /** Passkey oder Zwei-Faktor-Anmeldung */
  secured: boolean
}

export interface StartStep {
  key: 'depot' | 'buchungen' | 'ziel' | 'sicherheit'
  title: string
  body: string
  href: string
  action: string
  done: boolean
}

export const START_COOKIE = 'rt100k-start'

export function startSteps(state: StartState): StartStep[] {
  return [
    {
      key: 'depot',
      title: 'Depot oder Konto anlegen',
      body: 'Wertpapierdepot, Krypto, Tagesgeld oder Edelmetalle – je Bank oder Börse eines.',
      href: '/app/depots/neu',
      action: 'Anlegen',
      done: state.portfolios > 0,
    },
    {
      key: 'buchungen',
      title: 'Buchungen übernehmen',
      body: 'Abrechnungen als PDF oder CSV importieren – oder Käufe mit Stück und Kurs von Hand erfassen.',
      href: state.portfolios > 0 ? '/app/import' : '/app/depots/neu',
      action: 'Importieren',
      done: state.bookings > 0,
    },
    {
      key: 'ziel',
      title: 'Sparrate und Ziele festlegen',
      body: 'Damit Road to 100k und eigene Ziele wie der Notgroschen ausrechnen, wann du ankommst.',
      href: '/app/road',
      action: 'Planen',
      done: state.planned,
    },
    {
      key: 'sicherheit',
      title: 'Konto absichern',
      body: 'Mit Passkey oder Zwei-Faktor-Anmeldung – schützt deine Finanzdaten zusätzlich zum Passwort.',
      href: '/app/sicherheit',
      action: 'Absichern',
      done: state.secured,
    },
  ]
}

/** Nächster offener Schritt (oder null, wenn alles erledigt ist). */
export function nextStep(steps: readonly StartStep[]): StartStep | null {
  return steps.find((s) => !s.done) ?? null
}
