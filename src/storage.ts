import { openDB } from 'idb'
import type { Snapshot } from './instagram'

const DATABASE = 'followcheck-personal-v1'
const STORE = 'snapshots'

async function database() {
  return openDB(DATABASE, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
}

export async function getSnapshots(): Promise<Snapshot[]> {
  const db = await database()
  const snapshots = await db.getAll(STORE) as Snapshot[]
  return snapshots.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export async function addSnapshot(value: Snapshot): Promise<void> {
  const db = await database()
  await db.put(STORE, value)
}

export async function clearSnapshots(): Promise<void> {
  const db = await database()
  await db.clear(STORE)
}
