
// Minimal IndexedDB wrapper for queue & cache (no deps)
const DB_NAME = 'pdv-sante'
const DB_VERSION = 1
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function queuePush(event: any) {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    tx.objectStore('queue').put(event)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function queueAll(): Promise<any[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly')
    const req = tx.objectStore('queue').getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function queueDelete(id: string) {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    tx.objectStore('queue').delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
