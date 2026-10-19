import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Sicherheit: kein rohes HTML aus Nutzer- oder Fremddaten (siehe docs/SECURITY.md).
      'react/no-danger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Geldbeträge niemals als Float parsen – Hilfsfunktionen in src/lib/money.ts nutzen.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Geldbeträge nie als Float – nutze src/lib/money.ts.' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Datenbank nur über die Data-Access-Schicht (src/server/dal) – nie direkt aus Seiten oder Komponenten
    files: ['src/app/**', 'src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pg', message: 'DB-Zugriff nur über src/server/dal.' },
            { name: 'drizzle-orm', message: 'DB-Zugriff nur über src/server/dal.' },
          ],
          patterns: [
            { group: ['@/server/db/*', '**/server/db/*', 'drizzle-orm/*'], message: 'DB-Zugriff nur über src/server/dal.' },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
])
