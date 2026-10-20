'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { deleteCsvMapping, ImportConflictError, importBookings, saveCsvMapping, type CsvMappingDto } from '@/server/dal/imports'
import { addTasks } from '@/server/dal/notifications'
import { prepareImport, type PreparedImport } from '@/server/imports'
import { consumeRateLimit } from '@/server/dal/rate-limit'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; conflicts?: string[] }

function fail(error: unknown): { ok: false; error: string; conflicts?: string[] } {
  if (error instanceof ImportConflictError) return { ok: false, error: error.message, conflicts: error.instrumentIds }
  if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
  if (error instanceof Error && error.name === 'ZodError') return { ok: false, error: 'Ungültige Import-Daten.' }
  throw error
}

/** Instrumente zuordnen, Duplikate und schon importierte Dateien melden. */
export async function prepareImportAction(input: unknown): Promise<Result<PreparedImport>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    return { ok: true, ...(await prepareImport(user, input)) }
  } catch (error) {
    return fail(error)
  }
}

export async function commitImportAction(input: unknown): Promise<Result<{ created: number; duplicates: number }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    const result = await importBookings(user, input)
    revalidatePath('/app', 'layout')
    return { ok: true, ...result }
  } catch (error) {
    return fail(error)
  }
}

/** Kapitalmaßnahmen, die der Import nicht selbst buchen konnte, als Aufgaben merken. */
export async function saveImportTasksAction(texts: unknown): Promise<Result<{ created: number }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    const created = await addTasks(user, texts)
    revalidatePath('/app', 'layout')
    return { ok: true, created }
  } catch (error) {
    return fail(error)
  }
}

export async function saveMappingAction(name: unknown, mapping: unknown): Promise<Result<{ mapping: CsvMappingDto }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    return { ok: true, mapping: await saveCsvMapping(user, { name, mapping }) }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteMappingAction(id: unknown): Promise<Result<object>> {
  const user = await requireUser()
  try {
    await deleteCsvMapping(user, id)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
