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
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
])
