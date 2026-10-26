/** Anzeigetexte für das Audit-Log. */
export const AUDIT_LABELS: Record<string, string> = {
  login: 'Anmeldung',
  login_failed: 'Fehlgeschlagene Anmeldung',
  login_new_device: 'Anmeldung von einem neuen Gerät',
  logout: 'Abmeldung',
  sessions_revoked: 'Sitzungen beendet',
  password_changed: 'Passwort geändert',
  two_factor_enabled: 'Zwei-Faktor-Anmeldung eingeschaltet',
  two_factor_disabled: 'Zwei-Faktor-Anmeldung ausgeschaltet',
  passkey_added: 'Passkey hinzugefügt',
  passkey_removed: 'Passkey entfernt',
  account_created: 'Konto angelegt',
  invitation_created: 'Einladung erstellt',
  invitation_revoked: 'Einladung widerrufen',
  portfolio_deleted: 'Depot gelöscht',
  imports_deleted: 'Importierte Buchungen gelöscht',
  export: 'Daten exportiert',
  backup_restored: 'Backup wiederhergestellt',
  share_created: 'Freigabe-Link erstellt',
  share_revoked: 'Freigabe widerrufen',
  share_accepted: 'Freigabe angenommen',
  share_left: 'Freigabe verlassen',
  shared_goal_edited: 'Ziel über eine Freigabe geändert',
  new_device_confirmed: 'Neue Anmeldung als eigene bestätigt',
}

export function auditLabel(type: string): string {
  return AUDIT_LABELS[type] ?? type
}
