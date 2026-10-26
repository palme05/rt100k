import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Datenmodell rt100k.
 *
 * - Auth-Tabellen folgen dem Schema von Better Auth (Feldnamen = Schlüssel hier).
 * - Nutzerdaten tragen `owner_id`; Row Level Security erlaubt der App-Rolle nur
 *   Zeilen des Nutzers, der per `set_config('app.user_id', …)` in der laufenden
 *   Transaktion gesetzt ist (siehe src/server/db/client.ts → withUser).
 * - Geld als Integer-Cent (`bigint`), Stückzahlen als `numeric(30,12)` (String).
 * - Die Tabellen gehören der Migrationsrolle; nur sie darf DDL. Rechte der
 *   App-Rolle: drizzle/0002_grants.sql.
 */

export const appRole = pgRole('rt100k_app').existing()

/** Aktueller Nutzer der Transaktion (NULL, wenn keiner gesetzt ist → alles verboten). */
const currentUser = sql`app_user_id()`
const ownRows = sql`owner_id = app_user_id()`

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ── Auth (Better Auth) ──────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  /** 'member' | 'admin' – nie vom Client setzbar */
  role: text('role').notNull().default('member'),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [index('two_factor_user_idx').on(t.userId)],
)

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at', { withTimezone: true }),
    aaguid: text('aaguid'),
  },
  (t) => [index('passkey_user_idx').on(t.userId), uniqueIndex('passkey_credential_idx').on(t.credentialID)],
)

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

/**
 * Fehlversuche beim Passwort-Login je E-Mail (als SHA-256, auch für unbekannte
 * Adressen – sonst verriete die Sperre, welche Konten existieren).
 */
export const loginFailure = pgTable('login_failure', {
  emailHash: text('email_hash').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
})

// ── Einladungen & Audit ─────────────────────────────────────────────────────

/** Registrierung nur per Einladung: Token nur als SHA-256 gespeichert, einmalig, ablaufend, widerrufbar. */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').notNull().default('member'),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [check('invitation_role_check', sql`${t.role} in ('member', 'admin')`)],
)

/**
 * Audit-Log: nur anhängen. Lesen nur eigene Einträge; Löschen nur nach Ablauf
 * der Aufbewahrungsfrist (2 Jahre). Keine Finanzdaten, Tokens oder Session-IDs.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    detail: jsonb('detail').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_event_user_idx').on(t.userId, t.createdAt),
    pgPolicy('audit_event_select_own', { for: 'select', to: appRole, using: sql`user_id = ${currentUser}` }),
    pgPolicy('audit_event_insert', { for: 'insert', to: appRole, withCheck: sql`true` }),
    pgPolicy('audit_event_delete_expired', {
      for: 'delete',
      to: appRole,
      using: sql`created_at < now() - interval '730 days'`,
    }),
  ],
).enableRLS()

// ── Vermögen ────────────────────────────────────────────────────────────────

export const PORTFOLIO_KINDS = ['depot', 'krypto', 'cash', 'sachwert'] as const
export type PortfolioKind = (typeof PORTFOLIO_KINDS)[number]

/** Depot oder Konto (Tagesgeld, Verrechnungskonto, Tresor …). */
export const portfolio = pgTable(
  'portfolio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<PortfolioKind>().notNull(),
    broker: text('broker'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    taxSimple: boolean('tax_simple').notNull().default(true),
    createdAt: createdAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    index('portfolio_owner_idx').on(t.ownerId),
    unique('portfolio_id_owner_unique').on(t.id, t.ownerId),
    check('portfolio_kind_check', sql`${t.kind} in ('depot', 'krypto', 'cash', 'sachwert')`),
    check('portfolio_name_check', sql`char_length(${t.name}) between 1 and 80`),
    pgPolicy('portfolio_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

export const INSTRUMENT_KINDS = ['stock', 'etf', 'fund', 'bond', 'crypto', 'metal', 'other'] as const
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number]

/**
 * Wertpapier, Coin oder Edelmetall. `owner_id IS NULL` = allgemeine Stammdaten
 * (für alle lesbar, unveränderlich für die App), sonst privat.
 */
export const instrument = pgTable(
  'instrument',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<InstrumentKind>().notNull(),
    name: text('name').notNull(),
    isin: text('isin'),
    /** Symbol beim Kursanbieter, z. B. VWCE.DE (Yahoo) */
    symbol: text('symbol'),
    /** ID bei CoinGecko, z. B. bitcoin */
    coingeckoId: text('coingecko_id'),
    /** XAU, XAG, XPT, XPD – Kurs je Gramm */
    metal: text('metal'),
    /** Kurswährung */
    currency: char('currency', { length: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('instrument_kind_check', sql`${t.kind} in ('stock', 'etf', 'fund', 'bond', 'crypto', 'metal', 'other')`),
    check('instrument_name_check', sql`char_length(${t.name}) between 1 and 120`),
    check('instrument_isin_check', sql`${t.isin} is null or ${t.isin} ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'`),
    check('instrument_metal_check', sql`${t.metal} is null or ${t.metal} in ('XAU', 'XAG', 'XPT', 'XPD')`),
    uniqueIndex('instrument_global_symbol_idx').on(t.symbol).where(sql`owner_id is null and symbol is not null`),
    uniqueIndex('instrument_global_coingecko_idx').on(t.coingeckoId).where(sql`owner_id is null and coingecko_id is not null`),
    uniqueIndex('instrument_global_metal_idx').on(t.metal).where(sql`owner_id is null and metal is not null`),
    pgPolicy('instrument_select', { for: 'select', to: appRole, using: sql`owner_id is null or owner_id = ${currentUser}` }),
    pgPolicy('instrument_insert', {
      for: 'insert',
      to: appRole,
      withCheck: sql`owner_id is null or owner_id = ${currentUser}`,
    }),
    pgPolicy('instrument_update_own', { for: 'update', to: appRole, using: ownRows, withCheck: ownRows }),
    pgPolicy('instrument_delete_own', { for: 'delete', to: appRole, using: ownRows }),
  ],
).enableRLS()

export const BOOKING_TYPES = [
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
  'tax',
  'deposit',
  'withdrawal',
  'transfer_in',
  'transfer_out',
  'split',
  'staking',
  'age',
  'tax_refund',
] as const
export type BookingType = (typeof BOOKING_TYPES)[number]

/** Buchung (Transaktion). Beträge in Euro-Cent; Bedeutung je Typ: src/lib/holdings.ts. */
export const booking = pgTable(
  'booking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id').references(() => instrument.id, { onDelete: 'restrict' }),
    type: text('type').$type<BookingType>().notNull(),
    /** Handelstag (Wiener Datum) */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    quantity: numeric('quantity', { precision: 30, scale: 12 }),
    /** Split-Faktor (neue Stück je altem Stück) */
    factor: numeric('factor', { precision: 20, scale: 10 }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull().default(0),
    feeCents: bigint('fee_cents', { mode: 'number' }).notNull().default(0),
    taxCents: bigint('tax_cents', { mode: 'number' }).notNull().default(0),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    note: text('note'),
    source: text('source').notNull().default('manual'),
    /** SHA-256 über die Merkmale einer importierten Buchung (Duplikaterkennung), sonst NULL */
    importKey: text('import_key'),
    /**
     * Kurs je Stück bestätigt („Kurs stimmt – trotzdem speichern“): keine
     * Plausibilitätswarnung mehr. Jede Änderung ohne Häkchen setzt es zurück.
     */
    priceConfirmed: boolean('price_confirmed').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('booking_portfolio_idx').on(t.portfolioId, t.occurredOn),
    uniqueIndex('booking_import_key_idx').on(t.ownerId, t.importKey),
    check('booking_source_check', sql`${t.source} in ('manual', 'import')`),
    check('booking_import_key_check', sql`${t.importKey} is null or ${t.importKey} ~ '^[0-9a-f]{64}$'`),
    index('booking_owner_idx').on(t.ownerId),
    index('booking_instrument_idx').on(t.instrumentId),
    check(
      'booking_type_check',
      sql`${t.type} in ('buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'split', 'staking', 'age', 'tax_refund')`,
    ),
    check('booking_amounts_check', sql`${t.amountCents} >= 0 and ${t.feeCents} >= 0 and ${t.taxCents} >= 0`),
    check('booking_quantity_check', sql`${t.quantity} is null or ${t.quantity} > 0`),
    check('booking_factor_check', sql`${t.factor} is null or ${t.factor} > 0`),
    // Mehrwährung folgt später; bis dahin werden alle Buchungen in Euro erfasst
    check('booking_currency_check', sql`${t.currency} = 'EUR'`),
    check('booking_note_check', sql`${t.note} is null or char_length(${t.note}) <= 500`),
    pgPolicy('booking_owner', {
      for: 'all',
      to: appRole,
      using: ownRows,
      withCheck: sql`owner_id = ${currentUser} and exists (select 1 from portfolio p where p.id = portfolio_id and p.owner_id = ${currentUser})`,
    }),
  ],
).enableRLS()

export const IMPORT_SOURCES = ['traderepublic', 'flatex', 'bitpanda', 'csv'] as const

/**
 * Bereits importierte Dateien – nur der SHA-256 der Datei, nie die Datei selbst
 * (Brief: PDFs nach dem Parsen nicht speichern).
 */
export const importFile = pgTable(
  'import_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fileHash: text('file_hash').notNull(),
    source: text('source').notNull(),
    bookings: integer('bookings').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('import_file_owner_hash_idx').on(t.ownerId, t.fileHash),
    check('import_file_hash_check', sql`${t.fileHash} ~ '^[0-9a-f]{64}$'`),
    check('import_file_source_check', sql`${t.source} in ('traderepublic', 'flatex', 'bitpanda', 'csv')`),
    check('import_file_bookings_check', sql`${t.bookings} >= 0`),
    pgPolicy('import_file_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Gespeicherte Spaltenzuordnungen für den generischen CSV-Import. */
export const csvMapping = pgTable(
  'csv_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mapping: jsonb('mapping').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('csv_mapping_owner_name_idx').on(t.ownerId, t.name),
    check('csv_mapping_name_check', sql`char_length(${t.name}) between 1 and 60`),
    pgPolicy('csv_mapping_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

// ── Kurse (allgemein, keine Nutzerdaten) ────────────────────────────────────

/** Tagesschlusskurse gehaltener/beobachteter Instrumente, Kurs × 10⁶ in Kurswährung. */
export const priceDaily = pgTable(
  'price_daily',
  {
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    closeMicros: bigint('close_micros', { mode: 'number' }).notNull(),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.day] })],
)

/** EZB-Referenzkurse: Einheiten Fremdwährung je 1 EUR. */
export const fxDaily = pgTable(
  'fx_daily',
  {
    currency: char('currency', { length: 3 }).notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.day] })],
)

// ── Verlauf & Ziele ─────────────────────────────────────────────────────────

/** Täglicher Wert je Depot (Vercel Cron). */
export const portfolioSnapshot = pgTable(
  'portfolio_snapshot',
  {
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
    investedCents: bigint('invested_cents', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.portfolioId, t.day] }),
    index('portfolio_snapshot_owner_idx').on(t.ownerId, t.day),
    pgPolicy('portfolio_snapshot_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

export const ALLOCATION_KINDS = ['etf', 'stock', 'fund', 'bond', 'crypto', 'metal', 'other', 'cash'] as const

/** Zielaufteilung je Anlageklasse für den Rebalancing-Assistenten (Basispunkte, Summe 10 000 je Nutzer). */
export const allocationTarget = pgTable(
  'allocation_target',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    targetBp: integer('target_bp').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.kind] }),
    check('allocation_target_kind_check', sql`${t.kind} in ('etf', 'stock', 'fund', 'bond', 'crypto', 'metal', 'other', 'cash')`),
    check('allocation_target_bp_check', sql`${t.targetBp} between 1 and 10000`),
    pgPolicy('allocation_target_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/**
 * ETF-Durchschau: zusammengefasste Gewichte aus einer Bestandsliste, die der
 * Nutzer selbst beim Anbieter geladen hat (nur für ihn sichtbar, nie geteilt).
 */
export const etfBreakdown = pgTable(
  'etf_breakdown',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    fundName: text('fund_name'),
    asOf: date('as_of', { mode: 'string' }),
    rows: integer('rows').notNull(),
    /** [{ label, bp }] je Land, je Branche und die größten Titel */
    countries: jsonb('countries').notNull(),
    sectors: jsonb('sectors').notNull(),
    top: jsonb('top').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.instrumentId] }),
    check('etf_breakdown_rows_check', sql`${t.rows} between 1 and 20000`),
    check('etf_breakdown_name_check', sql`${t.fundName} is null or char_length(${t.fundName}) <= 120`),
    pgPolicy('etf_breakdown_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/**
 * Freigabe eines Depots zum Lesen. Zuerst ein Link (nur der SHA-256 des
 * Tokens, 72 h gültig, einmalig), nach dem Annehmen mit Empfänger. Annehmen
 * und Vorschau laufen über eng begrenzte Funktionen (Migration 0012), weil
 * der Empfänger die Zeile vorher nicht sehen darf.
 */
export const portfolioShare = pgTable(
  'portfolio_share',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    granteeId: text('grantee_id').references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Depot und Besitzer gehören zusammen: nur der Besitzer kann sein Depot freigeben
    foreignKey({ name: 'portfolio_share_portfolio_owner_fk', columns: [t.portfolioId, t.ownerId], foreignColumns: [portfolio.id, portfolio.ownerId] }).onDelete('cascade'),
    index('portfolio_share_portfolio_idx').on(t.portfolioId),
    index('portfolio_share_grantee_idx').on(t.granteeId),
    uniqueIndex('portfolio_share_unique_grantee').on(t.portfolioId, t.granteeId).where(sql`grantee_id is not null`),
    check('portfolio_share_state_check', sql`(${t.granteeId} is null) = (${t.acceptedAt} is null) and (${t.granteeId} is null) = (${t.tokenHash} is not null)`),
    check('portfolio_share_token_check', sql`${t.tokenHash} is null or ${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('portfolio_share_not_self', sql`${t.granteeId} is null or ${t.granteeId} <> ${t.ownerId}`),
    pgPolicy('portfolio_share_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
    pgPolicy('portfolio_share_grantee_read', { for: 'select', to: appRole, using: sql`grantee_id = ${currentUser}` }),
    pgPolicy('portfolio_share_grantee_leave', { for: 'delete', to: appRole, using: sql`grantee_id = ${currentUser}` }),
  ],
).enableRLS()

export const NOTIFICATION_KINDS = ['price_alert', 'dividend', 'milestone', 'speculation_end', 'task', 'savings_plan', 'import_reminder'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/**
 * Hinweise in der App (vom täglichen Lauf erzeugt). Beträge stehen getrennt in
 * `amount_cents`, damit die Oberfläche sie über den Privatsphäre-Modus zeigt.
 * `dedupe_key` verhindert doppelte Hinweise für dasselbe Ereignis.
 */
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    title: text('title').notNull(),
    body: text('body'),
    amountCents: bigint('amount_cents', { mode: 'number' }),
    link: text('link'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notification_owner_dedupe_idx').on(t.ownerId, t.dedupeKey),
    index('notification_owner_idx').on(t.ownerId, t.createdAt),
    check('notification_kind_check', sql`${t.kind} in ('price_alert', 'dividend', 'milestone', 'speculation_end', 'task', 'savings_plan', 'import_reminder')`),
    check('notification_text_check', sql`char_length(${t.title}) between 1 and 120 and (${t.body} is null or char_length(${t.body}) <= 500) and char_length(${t.dedupeKey}) between 1 and 200`),
    check('notification_link_check', sql`${t.link} is null or ${t.link} ~ '^/app(/[A-Za-z0-9_/-]*)?$'`),
    pgPolicy('notification_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Kursalarm je Instrument: über oder unter einem Kurs in Mikro-Euro, einmalig. */
export const priceAlert = pgTable(
  'price_alert',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    direction: text('direction').$type<'above' | 'below'>().notNull(),
    thresholdMicros: bigint('threshold_micros', { mode: 'bigint' }).notNull(),
    createdAt: createdAt(),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
  },
  (t) => [
    index('price_alert_owner_idx').on(t.ownerId),
    check('price_alert_direction_check', sql`${t.direction} in ('above', 'below')`),
    check('price_alert_threshold_check', sql`${t.thresholdMicros} > 0`),
    pgPolicy('price_alert_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Web-Push-Abo eines Geräts (nur bekannte Push-Dienste, siehe src/lib/push.ts). */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('push_subscription_owner_endpoint_idx').on(t.ownerId, t.endpoint),
    check('push_subscription_endpoint_check', sql`${t.endpoint} ~ '^https://' and char_length(${t.endpoint}) <= 1000`),
    check('push_subscription_keys_check', sql`${t.p256dh} ~ '^[A-Za-z0-9_-]{80,100}$' and ${t.auth} ~ '^[A-Za-z0-9_-]{16,32}$'`),
    pgPolicy('push_subscription_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/**
 * Rate-Limit je Nutzer und Aktion (src/server/dal/rate-limit.ts). Eigene
 * Tabelle, weil Better Auth in `rate_limit` alle Zeilen außerhalb seiner
 * kurzen Fenster löscht.
 */
export const userRateLimit = pgTable(
  'user_rate_limit',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    count: integer('count').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.action] }),
    check('user_rate_limit_action_check', sql`${t.action} ~ '^[a-z]{1,20}$'`),
    pgPolicy('user_rate_limit_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Annahmen für Road to 100k (eine Zeile je Nutzer). */
export const roadSettings = pgTable(
  'road_settings',
  {
    ownerId: text('owner_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetCents: bigint('target_cents', { mode: 'number' }).notNull().default(10_000_000),
    monthlyContributionCents: bigint('monthly_contribution_cents', { mode: 'number' }).notNull().default(50_000),
    /** Basispunkte p. a., 650 = 6,5 % */
    expectedReturnBp: integer('expected_return_bp').notNull().default(650),
    volatilityBp: integer('volatility_bp').notNull().default(1500),
    includeTangibles: boolean('include_tangibles').notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('road_settings_ranges', sql`${t.targetCents} > 0 and ${t.monthlyContributionCents} >= 0 and ${t.expectedReturnBp} between -2000 and 3000 and ${t.volatilityBp} between 0 and 10000`),
    pgPolicy('road_settings_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/**
 * Rückgängig nach Löschen oder Ändern einer Buchung: der Stand davor als
 * Kopie, nur kurz aufgehoben (src/server/dal/booking-undo.ts). Gehört zum
 * Depot und verschwindet mit ihm.
 */
export const bookingUndo = pgTable(
  'booking_undo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    portfolioId: uuid('portfolio_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    action: text('action').$type<'delete' | 'update'>().notNull(),
    /** Alle Spalten der Buchung vor der Änderung */
    snapshot: jsonb('snapshot').notNull(),
    /** `updated_at` der Buchung nach dem Ändern – Rückgängig nur, solange sie seitdem gleich geblieben ist */
    changedAt: timestamp('changed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'booking_undo_portfolio_owner_fk', columns: [t.portfolioId, t.ownerId], foreignColumns: [portfolio.id, portfolio.ownerId] }).onDelete('cascade'),
    index('booking_undo_owner_idx').on(t.ownerId, t.createdAt),
    check('booking_undo_action_check', sql`${t.action} in ('delete', 'update') and (${t.action} = 'delete') = (${t.changedAt} is null)`),
    pgPolicy('booking_undo_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Beobachtete Werte (Watchlist) – nur allgemeine oder eigene Instrumente. */
export const watchlistItem = pgTable(
  'watchlist_item',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.instrumentId] }),
    index('watchlist_item_instrument_idx').on(t.instrumentId),
    check('watchlist_item_note_check', sql`${t.note} is null or char_length(${t.note}) <= 200`),
    pgPolicy('watchlist_item_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/**
 * Eigenes Sparziel (Notgroschen, Kinderdepot …): Betrag, optional Datum,
 * Sparrate und Rendite; zählt alle Depots oder eine Auswahl (goal_portfolio).
 */
export const goal = pgTable(
  'goal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetCents: bigint('target_cents', { mode: 'number' }).notNull(),
    targetDate: date('target_date', { mode: 'string' }),
    monthlyCents: bigint('monthly_cents', { mode: 'number' }),
    /** Basispunkte p. a.; NULL = Annahme aus Road to 100k */
    returnBp: integer('return_bp'),
    /** 'all' = alle Depots und Konten, 'selected' = nur die in goal_portfolio */
    scope: text('scope').$type<'all' | 'selected'>().notNull().default('all'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('goal_owner_idx').on(t.ownerId),
    unique('goal_id_owner_unique').on(t.id, t.ownerId),
    check('goal_name_check', sql`char_length(${t.name}) between 1 and 60`),
    check('goal_amounts_check', sql`${t.targetCents} > 0 and (${t.monthlyCents} is null or ${t.monthlyCents} >= 0)`),
    check('goal_return_check', sql`${t.returnBp} is null or ${t.returnBp} between -2000 and 3000`),
    check('goal_scope_check', sql`${t.scope} in ('all', 'selected')`),
    pgPolicy('goal_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()

/** Depots eines Ziels mit Auswahl; Ziel und Depot gehören demselben Nutzer (zusammengesetzte Fremdschlüssel). */
export const goalPortfolio = pgTable(
  'goal_portfolio',
  {
    goalId: uuid('goal_id').notNull(),
    portfolioId: uuid('portfolio_id').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.goalId, t.portfolioId] }),
    foreignKey({ name: 'goal_portfolio_goal_owner_fk', columns: [t.goalId, t.ownerId], foreignColumns: [goal.id, goal.ownerId] }).onDelete('cascade'),
    foreignKey({ name: 'goal_portfolio_portfolio_owner_fk', columns: [t.portfolioId, t.ownerId], foreignColumns: [portfolio.id, portfolio.ownerId] }).onDelete('cascade'),
    index('goal_portfolio_owner_idx').on(t.ownerId),
    pgPolicy('goal_portfolio_owner', { for: 'all', to: appRole, using: ownRows, withCheck: ownRows }),
  ],
).enableRLS()
