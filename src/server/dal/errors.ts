/** Fehler der Data-Access-Schicht. Meldungen sind für Nutzer lesbar (Deutsch). */

/** Gibt es nicht – oder gehört jemand anderem. Bewusst nicht unterscheidbar (kein Leck über IDs). */
export class NotFoundError extends Error {
  constructor(message = 'Nicht gefunden.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Keine Berechtigung.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Eingabe ist gültig, wirkt aber unplausibel (Kurs je Stück weit weg vom
 * Schlusskurs, wahrscheinlich doppelt gebucht). Speichern erst nach
 * ausdrücklicher Bestätigung – je Art ein eigenes Häkchen.
 */
export class ConfirmationRequired extends ValidationError {
  constructor(
    message: string,
    field?: string,
    readonly kind: 'price' | 'duplicate' = 'price',
  ) {
    super(message, field)
    this.name = 'ConfirmationRequired'
  }
}
