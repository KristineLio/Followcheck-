import JSZip from 'jszip'

export type Snapshot = {
  id: string
  importedAt: string
  sourceName: string
  followers: string[]
  following: string[]
}

export type FollowerAnalysis = {
  notFollowingBack: string[]
  youDontFollowBack: string[]
  mutual: string[]
  gained: string[]
  lost: string[]
}

const MAX_ARCHIVE_BYTES = 75 * 1024 * 1024
const MAX_JSON_BYTES = 40 * 1024 * 1024

function username(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const name = input.trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(name) ? name : null
}

export function extractUsernames(data: unknown): string[] {
  const records: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? Object.values(data).filter(Array.isArray).flat()
      : []
  const values = new Set<string>()

  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    const item = record as Record<string, unknown>
    const embedded = Array.isArray(item.string_list_data) ? item.string_list_data : []
    for (const row of embedded) {
      if (row && typeof row === 'object') {
        const value = username((row as Record<string, unknown>).value)
        if (value) values.add(value)
      }
    }
    const title = username(item.title)
    if (title) values.add(title)
    const name = username(item.username)
    if (name) values.add(name)
  }

  return [...values].sort((a, b) => a.localeCompare(b))
}

function relationshipFile(path: string): 'followers' | 'following' | null {
  const basename = path.split('/').pop()?.toLowerCase() ?? ''
  if (/^followers(?:_\d+)?\.json$/.test(basename)) return 'followers'
  if (/^following(?:_\d+)?\.json$/.test(basename)) return 'following'
  return null
}

export async function parseInstagramZip(file: File): Promise<Snapshot> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Choose the original ZIP export from Instagram. Select JSON when requesting your data.')
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error('This ZIP is too large for phone processing (75 MB maximum). Export only Followers and Following.')
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('This does not appear to be a valid ZIP file.')
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'))
  if (entries.length > 2000) throw new Error('This ZIP contains too many files. Export only Followers and Following.')

  const followers = new Set<string>()
  const following = new Set<string>()
  let foundFollowers = false
  let foundFollowing = false

  for (const entry of entries) {
    const kind = relationshipFile(entry.name)
    if (!kind) continue

    let raw: string
    try {
      raw = await entry.async('string')
    } catch {
      throw new Error('Could not read ' + entry.name + ' from the ZIP.')
    }
    if (raw.length > MAX_JSON_BYTES) {
      throw new Error('A relationship file is too large to analyze safely on this phone.')
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(entry.name + ' is not valid JSON. Request a new Instagram export.')
    }

    if (kind === 'followers') foundFollowers = true
    if (kind === 'following') foundFollowing = true
    for (const user of extractUsernames(data)) {
      if (kind === 'followers') followers.add(user)
      else following.add(user)
    }
  }

  if (!foundFollowers || !foundFollowing) {
    throw new Error('Missing followers or following JSON. In Instagram export settings, choose Followers and Following, All time, and JSON.')
  }

  return {
    id: crypto.randomUUID(),
    importedAt: new Date().toISOString(),
    sourceName: file.name,
    followers: [...followers].sort(),
    following: [...following].sort(),
  }
}

export function analyze(current: Snapshot, previous?: Snapshot): FollowerAnalysis {
  const followers = new Set(current.followers)
  const following = new Set(current.following)
  const previousFollowers = new Set(previous?.followers ?? [])

  return {
    notFollowingBack: current.following.filter((name) => !followers.has(name)),
    youDontFollowBack: current.followers.filter((name) => !following.has(name)),
    mutual: current.following.filter((name) => followers.has(name)),
    gained: previous ? current.followers.filter((name) => !previousFollowers.has(name)) : [],
    lost: previous ? previous.followers.filter((name) => !followers.has(name)) : [],
  }
}
