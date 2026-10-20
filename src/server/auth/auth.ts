import 'server-only'
import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { and, eq, ne } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { recordAudit, summarizeUserAgent } from '../dal/audit'
import { clearFailures, isLocked, registerFailure } from './lockout'

/**
 * Better Auth (selbst gehostet). Entscheidungen: docs/ARCHITECTURE.md (A5),
 * Sicherheitsanforderungen: docs/SECURITY.md → Login & Sessions.
 *
 * - Registrierung nur per Einladung: der öffentliche Endpunkt ist abgeschaltet,
 *   Konten legt nur src/app/einladung/[token]/actions.ts nach Prüfung des Links an.
 * - Passwort (min. 12 Zeichen) + TOTP oder Passkey; für Admins ist TOTP Pflicht
 *   (durchgesetzt in src/server/auth/session.ts).
 * - Rate-Limit in der Datenbank (gilt über alle Serverless-Instanzen) plus
 *   Sperre je E-Mail nach Fehlversuchen (lockout.ts).
 * - Keine E-Mails (Entscheidung des Betreibers, 19.10.2026): Hinweise erscheinen in der App.
 */

export const APP_NAME = 'rt100k'

/** Öffentliche Adresse der App: Produktion fest, Previews über die Branch-URL, lokal localhost. */
export function appBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`
  return 'http://localhost:3000'
}

function trustedOrigins(): string[] {
  const origins = [new URL(appBaseUrl()).origin]
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`)
  return origins
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET fehlt oder ist zu kurz (min. 32 Zeichen).')

  return betterAuth({
    appName: APP_NAME,
    baseURL: appBaseUrl(),
    secret,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        passkey: schema.passkey,
        rateLimit: schema.rateLimit,
      },
    }),
    telemetry: { enabled: false },
    disabledPaths: ['/sign-up/email', '/request-password-reset', '/reset-password', '/delete-user'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        role: { type: 'string', input: false, defaultValue: 'member' },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 Tage
      updateAge: 60 * 60 * 24, // täglich erneuert
      freshAge: 60 * 15, // sensible Aktionen nur kurz nach dem Login
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
      },
    },
    advanced: {
      // Ausdrücklich an (Better Auth schaltet beides in Testumgebungen sonst ab)
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: appBaseUrl().startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },
    plugins: [
      twoFactor({ issuer: APP_NAME }),
      passkey({ rpName: APP_NAME }),
      nextCookies(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/two-factor/disable' && (await getSessionFromCtx(ctx))?.user.role === 'admin') {
          throw new APIError('FORBIDDEN', { message: 'Für Admins ist die Zwei-Faktor-Anmeldung Pflicht.' })
        }
        if (ctx.path === '/sign-in/email') {
          const email = typeof ctx.body?.email === 'string' ? ctx.body.email : ''
          if (email && (await isLocked(email))) {
            throw new APIError('TOO_MANY_REQUESTS', {
              message: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen oder mit Passkey anmelden.',
            })
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const request = ctx.request
        const ip = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
        const userAgent = request?.headers.get('user-agent') ?? null

        if (ctx.path === '/sign-in/email') {
          const email = typeof ctx.body?.email === 'string' ? ctx.body.email : ''
          if (isAPIError(ctx.context.returned) && ctx.context.returned.statusCode === 401 && email) {
            await registerFailure(email)
            const [known] = await getDb()
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(eq(schema.user.email, email.trim().toLowerCase()))
              .limit(1)
            if (known) await recordAudit({ userId: known.id, type: 'login_failed', ip, userAgent })
            return
          }
          if (email && !isAPIError(ctx.context.returned)) await clearFailures(email)
        }

        // Erfolgreiche, vollständige Anmeldung (2FA erledigt bzw. Passkey). Beim
        // Einrichten von 2FA gibt Better Auth ebenfalls eine neue Session aus –
        // das ist keine Anmeldung (vorher bestand schon eine Session).
        const created = ctx.context.newSession
        const hadSession = Boolean(ctx.context.session)
        const loginPaths = ['/sign-in/email', '/two-factor/verify-totp', '/two-factor/verify-backup-code', '/passkey/verify-authentication']
        const isLogin =
          created !== null &&
          created !== undefined &&
          loginPaths.includes(ctx.path) &&
          !(ctx.path === '/sign-in/email' && created.user.twoFactorEnabled) &&
          !(ctx.path.startsWith('/two-factor/') && hadSession)
        if (isLogin && created) {
          await recordAudit({ userId: created.user.id, actorId: created.user.id, type: 'login', ip, userAgent, detail: { method: ctx.path.startsWith('/passkey') ? 'passkey' : 'passwort' } })
          // Neues Gerät: diese Browser/OS-Kombination gab es bisher in keiner Session
          const device = summarizeUserAgent(userAgent)
          const others = await getDb()
            .select({ userAgent: schema.session.userAgent })
            .from(schema.session)
            .where(and(eq(schema.session.userId, created.user.id), ne(schema.session.id, created.session.id)))
          const known = others.some((s) => summarizeUserAgent(s.userAgent) === device)
          if (others.length > 0 && !known) {
            await recordAudit({ userId: created.user.id, actorId: created.user.id, type: 'login_new_device', ip, userAgent })
          }
        }

        if (ctx.path === '/sign-out' && ctx.context.session) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'logout', ip, userAgent })
        }
        if (ctx.path === '/revoke-sessions' && ctx.context.session) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'sessions_revoked', ip, userAgent })
        }
        if (ctx.path === '/change-password' && ctx.context.session && !isAPIError(ctx.context.returned)) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'password_changed', ip, userAgent })
        }
        if (ctx.path === '/two-factor/verify-totp' && ctx.context.session && !isAPIError(ctx.context.returned)) {
          // Bestätigung beim Einrichten (kein Login)
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'two_factor_enabled', ip, userAgent })
        }
        if (ctx.path === '/two-factor/disable' && ctx.context.session && !isAPIError(ctx.context.returned)) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'two_factor_disabled', ip, userAgent })
        }
        if (ctx.path === '/passkey/verify-registration' && ctx.context.session && !isAPIError(ctx.context.returned)) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'passkey_added', ip, userAgent })
        }
        if (ctx.path === '/passkey/delete-passkey' && ctx.context.session && !isAPIError(ctx.context.returned)) {
          await recordAudit({ userId: ctx.context.session.user.id, actorId: ctx.context.session.user.id, type: 'passkey_removed', ip, userAgent })
        }
      }),
    },
  })
}

type Auth = ReturnType<typeof createAuth>
let auth: Auth | undefined

/** Better-Auth-Instanz (lazy, damit der Build ohne Secrets funktioniert). */
export function getAuth(): Auth {
  auth ??= createAuth()
  return auth
}
