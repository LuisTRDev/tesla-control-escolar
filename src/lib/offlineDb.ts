const DB_NAME = 'tesla-control-offline'
const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'
const QUEUE = 'sync_queue'
const META = 'meta'

export type SyncOperationType = 'ATTENDANCE_UPSERT' | 'ATTENDANCE_EXIT_UPSERT' | 'PRESENTATION_UPSERT'

export type SyncQueueItem = {
  id: string
  type: SyncOperationType
  payload: Record<string, unknown>
  createdAt: string
  retryCount: number
  lastError?: string
  operationKey?: string
}

type SnapshotRow = { key: string; value: unknown; updatedAt: string }
type MetaRow = { key: string; value: unknown }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function setSnapshot<T>(key: string, value: T): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readwrite')
  tx.objectStore(SNAPSHOTS).put({ key, value, updatedAt: new Date().toISOString() } satisfies SnapshotRow)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
}

export async function getSnapshot<T>(key: string): Promise<T | null> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readonly')
  const row = await requestResult(tx.objectStore(SNAPSHOTS).get(key)) as SnapshotRow | undefined
  db.close()
  return row ? row.value as T : null
}

function operationKey(type: SyncOperationType, payload: Record<string, unknown>): string {
  const studentId = String(payload.studentId ?? '')
  const date = String(payload.date ?? '')
  return `${type}:${studentId}:${date}`
}

export async function enqueueOperation(type: SyncOperationType, payload: Record<string, unknown>): Promise<SyncQueueItem> {
  const key = operationKey(type, payload)
  const existing = (await listPendingOperations()).find((item) => item.operationKey === key || operationKey(item.type, item.payload) === key)
  const item: SyncQueueItem = {
    id: existing?.id ?? `${type}-${crypto.randomUUID()}`,
    type,
    payload,
    operationKey: key,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    retryCount: 0,
  }
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).put(item)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
  window.dispatchEvent(new CustomEvent('tesla-sync-queue-changed'))
  return item
}

export async function listPendingOperations(): Promise<SyncQueueItem[]> {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readonly')
  const rows = await requestResult(tx.objectStore(QUEUE).getAll()) as SyncQueueItem[]
  db.close()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removePendingOperation(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).delete(id)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
  window.dispatchEvent(new CustomEvent('tesla-sync-queue-changed'))
}

export async function updatePendingOperation(item: SyncQueueItem): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).put(item)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
  window.dispatchEvent(new CustomEvent('tesla-sync-queue-changed'))
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put({ key, value } satisfies MetaRow)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await openDb()
  const tx = db.transaction(META, 'readonly')
  const row = await requestResult(tx.objectStore(META).get(key)) as MetaRow | undefined
  db.close()
  return row ? row.value as T : null
}

export async function exportOfflineState() {
  const [queue, lastSync] = await Promise.all([listPendingOperations(), getMeta<string>('last_sync')])
  return { queue, lastSync }
}

export async function clearCachedSnapshots(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readwrite')
  tx.objectStore(SNAPSHOTS).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
