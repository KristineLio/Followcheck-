import JSZip from 'jszip'
import { DomUtils, parseDocument } from 'htmlparser2'

export type Snapshot = {
  id: string
  importedAt: string
  sourceName: string
  format?: 'HTML' | 'JSON'
  sourceFiles?: Array<{ name: string; kind: 'followers' | 'following'; parsed: number }>
  checkedFollowerCount?: number
  checkedFollowingCount?: number
  archiveIdentity?: string
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
const MAX_RELATIONSHIP_BYTES = 40 * 1024 * 1024

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

// Parse untrusted export HTML as data only: never render markup or request its resources.
export function extractHtmlUsernames(html: string): string[] {
  const document = parseDocument(html)
  const links = DomUtils.getElementsByTagName('a', document.children)
  const values = new Set<string>()

  for (const link of links) {
    const href = link.attribs.href
    if (!href) continue
    try {
      const url = new URL(href)
      if (url.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(url.hostname)) continue
      const parts = url.pathname.split('/').filter(Boolean)
      let candidate: string | undefined
      if (parts.length === 1) candidate = parts[0]
      if (parts.length === 2 && parts[0] === '_u') candidate = parts[1]
      const excluded = new Set(['accounts', 'explore', 'reel', 'reels', 'stories', 'p', 'direct', 'about', 'legal', 'privacy', 'terms', 'developer'])
      if (!candidate || excluded.has(candidate.toLowerCase())) continue
      const name = username(decodeURIComponent(candidate))
      if (name) values.add(name)
    } catch {
      // Ignore malformed or non-Instagram links.
    }
  }

  return [...values].sort((a, b) => a.localeCompare(b))
}

type RelationshipKind = 'followers' | 'following'
type ExportFormat = 'HTML' | 'JSON'

function relationshipFile(path: string): { kind: RelationshipKind; format: ExportFormat } | null {
  const basename = path.split('/').pop()?.toLowerCase() ?? ''
  const match = basename.match(/^(followers|following)(?:_\d+)?\.(html|json)$/)
  if (!match) return null
  return { kind: match[1] as RelationshipKind, format: match[2] === 'html' ? 'HTML' : 'JSON' }
}

export async function parseInstagramZip(file: File): Promise<Snapshot> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Choose the original Instagram ZIP export, not an individual HTML or JSON file.')
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

  const identified = entries.map((entry) => ({ entry, match: relationshipFile(entry.name) }))
    .filter((item): item is { entry: JSZip.JSZipObject; match: { kind: RelationshipKind; format: ExportFormat } } => Boolean(item.match))
  const hasBoth = (format: ExportFormat) =>
    identified.some((item) => item.match.format === format && item.match.kind === 'followers') &&
    identified.some((item) => item.match.format === format && item.match.kind === 'following')

  // Prefer JSON if a ZIP happens to contain two complete representations;
  // don't combine mismatched snapshots from separate formats.
  const format: ExportFormat | null = hasBoth('JSON') ? 'JSON' : hasBoth('HTML') ? 'HTML' : null
  if (!format) {
    throw new Error('Could not find a complete Followers and Following export. In Instagram, select Followers and following, All time, and HTML or JSON, then download the original ZIP.')
  }

  const followers = new Set<string>()
  const following = new Set<string>()
  const sourceFiles: NonNullable<Snapshot['sourceFiles']> = []

  for (const { entry, match } of identified) {
    if (match.format !== format) continue

    // JSZip metadata lets us reject unusually large decompression before loading it.
    const uncompressedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    if (typeof uncompressedSize === 'number' && uncompressedSize > MAX_RELATIONSHIP_BYTES) {
      throw new Error('A relationship file is too large to process safely on this phone.')
    }

    let raw: string
    try {
      raw = await entry.async('string')
    } catch {
      throw new Error('Could not read ' + entry.name + ' from the ZIP.')
    }
    if (raw.length > MAX_RELATIONSHIP_BYTES) {
      throw new Error('A relationship file is too large to process safely on this phone.')
    }

    let names: string[]
    if (format === 'JSON') {
      try {
        names = extractUsernames(JSON.parse(raw) as unknown)
      } catch {
        throw new Error(entry.name + ' is not valid JSON. Request a fresh Instagram export.')
      }
    } else {
      if (!/<html[\s>]/i.test(raw)) {
        throw new Error(entry.name + ' does not look like an Instagram HTML export.')
      }
      names = extractHtmlUsernames(raw)
    }

    sourceFiles.push({ name: entry.name.split('/').pop() ?? entry.name, kind: match.kind, parsed: names.length })
    for (const user of names) {
      if (match.kind === 'followers') followers.add(user)
      else following.add(user)
    }
  }

  return {
    id: crypto.randomUUID(),
    importedAt: new Date().toISOString(),
    sourceName: file.name,
    format,
    sourceFiles,
    archiveIdentity: [file.name, file.size, file.lastModified].join(':'),
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
