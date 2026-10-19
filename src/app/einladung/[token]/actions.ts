'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { registerWithInvitation } from '@/server/auth/register'
import { ValidationError } from '@/server/dal/errors'

export interface RegisterState {
  error: string | null
  field: string | null
  values: { name: string; email: string }
}

export async function registerAction(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  const input = {
    token: String(formData.get('token') ?? ''),
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    passwordRepeat: String(formData.get('passwordRepeat') ?? ''),
  }
  try {
    await registerWithInvitation(input, await headers())
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message, field: error.field ?? null, values: { name: input.name, email: input.email } }
    console.error('Registrierung fehlgeschlagen:', error instanceof Error ? error.name : 'unbekannt')
    return { error: 'Das hat nicht geklappt. Bitte erneut versuchen.', field: null, values: { name: input.name, email: input.email } }
  }
  redirect('/app/sicherheit?willkommen=1')
}
