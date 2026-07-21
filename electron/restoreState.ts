// Yedekten geri yükleme sırasında (db.close() -> dosya kopyalama -> yeniden bağlanma)
// diğer IPC çağrılarının kapalı/tutarsız bir veritabanı durumuna erişmesini engeller.

let restoreInProgress = false

export function setRestoreInProgress(value: boolean): void {
  restoreInProgress = value
}

export function isRestoreInProgress(): boolean {
  return restoreInProgress
}
