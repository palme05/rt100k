import 'server-only'
import { APIError } from 'better-auth/api'
import { z } from 'zod'
import { recordAudit } from '../dal/audit'
import { ValidationError } from '../dal/errors'
import { claimInvitation, completeInvitation, releaseInvitation } from '../dal/invitations'
import { setUserRole } from '../dal/users'
import { getAuth } from './auth'

export const registrationInput = z
  .object({
    token: z.string(),
    name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(80, 'Name: höchstens 80 Zeichen.'),
    email: z.email('Bitte eine gültige E-Mail-Adresse angeben.').trim().toLowerCase().max(254),
    password: z.string().min(12, 'Das Passwort braucht mindestens 12 Zeichen.').max(128, 'Das Passwort darf höchstens 128 Zeichen haben.'),
    passwordRepeat: z.string(),
  })
  .refine((d) => d.password === d.passwordRepeat, { message: 'Die Passwörter stimmen nicht überein.', path: ['passwordRepeat'] })

/**
 * Legt ein Konto über einen Einladungslink an. Die Einladung wird zuerst
 * atomar reserviert; scheitert das Anlegen, wird sie wieder freigegeben.
 * Better Auth meldet den neuen Nutzer direkt an (Session-Cookie).
 */
export async function registerWithInvitation(input: unknown, requestHeaders: Headers): Promise<{ userId: string }> {
  const parsed = registrationInput.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Eingabe.', issue?.path.join('.'))
  }
  const { token, name, email, password } = parsed.data

  const claim = await claimInvitation(token)
  if (!claim) throw new ValidationError('Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon verwendet.')

  let userId: string
  try {
    const result = await getAuth().api.signUpEmail({ body: { name, email, password }, headers: requestHeaders })
    userId = result.user.id
  } catch (error) {
    await releaseInvitation(claim.id)
    if (error instanceof APIError) {
      // Bewusst unspezifisch (verrät nicht, ob es die Adresse schon gibt)
      throw new ValidationError('Mit diesen Angaben kann kein Konto angelegt werden. Bitte eine andere E-Mail-Adresse verwenden.', 'email')
    }
    throw error
  }

  if (claim.role === 'admin') await setUserRole(userId, 'admin')
  await completeInvitation(claim.id, userId)
  await recordAudit({
    userId,
    actorId: userId,
    type: 'account_created',
    detail: { role: claim.role },
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  })
  return { userId }
}
