import { passkeyClient } from '@better-auth/passkey/client'
import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser-Client für Better Auth (spricht nur mit /api/auth der eigenen Origin).
 * Die Weiterleitung zur 2FA-Abfrage übernimmt das Login-Formular selbst.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient(), passkeyClient()],
})
