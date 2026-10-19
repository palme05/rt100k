/**
 * Bereitet die E2E-Datenbank vor (frisch, migriert) – läuft vor `next start`
 * im webServer-Kommando von Playwright.
 */
import { prepareDatabase } from '../src/test/db-setup.ts'

await prepareDatabase('rt100k_e2e')
process.stdout.write('E2E-Datenbank bereit.\n')
