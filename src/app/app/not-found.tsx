import { NotFoundState } from '@/components/shell/NotFoundState'
import { APP_BASE } from './navigation'

/** Unbekannte oder fremde Adresse innerhalb der App: Navigation bleibt da. */
export default function AppNotFound() {
  return <NotFoundState homeHref={APP_BASE} />
}
