'use client'

import { usePathname } from 'next/navigation'
import { IconLink } from '../ui/IconButton'
import { isActive } from './nav'

/**
 * Glocke in der Kopfzeile: Link zu den Hinweisen mit der Zahl der ungelesenen
 * als Text (über dem Symbol, ändert die Breite nie) und im Namen.
 */
export function NotificationBell({ href, unread, activePrefixes }: { href: string; unread: number; activePrefixes?: readonly string[] }) {
  const pathname = usePathname()
  const label = unread > 0 ? `Hinweise, ${unread} ungelesen` : 'Hinweise'
  return <IconLink href={href} icon="bell" label={label} badge={unread > 0 ? (unread > 99 ? '99+' : unread) : null} current={isActive(pathname, activePrefixes ? { href, activePrefixes } : { href })} />
}
