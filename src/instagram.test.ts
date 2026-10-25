import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { analyze, extractUsernames, parseInstagramZip, type Snapshot } from './instagram'

function fixture(followers: string[], following: string[]): Promise<File> {
  const zip = new JSZip()
  zip.file('instagram/connections/followers_and_following/followers_1.json',
    JSON.stringify(followers.map((value) => ({ string_list_data: [{ value }] }))))
  zip.file('instagram/connections/followers_and_following/following.json',
    JSON.stringify({ relationships_following: following.map((name) => ({
      title: name, string_list_data: [{ value: name }],
    })) }))
  return zip.generateAsync({ type: 'blob' }).then((blob) => new File([blob], 'instagram.zip', { type: 'application/zip' }))
}

describe('Instagram ZIP parsing', () => {
  it('handles followers arrays, following wrappers, and duplicates', async () => {
    const snap = await parseInstagramZip(await fixture(['Alice', 'BOB', 'alice'], ['Bob', 'Charlie']))
    expect(snap.followers).toEqual(['alice', 'bob'])
    expect(snap.following).toEqual(['bob', 'charlie'])
    expect(analyze(snap).notFollowingBack).toEqual(['charlie'])
    expect(analyze(snap).youDontFollowBack).toEqual(['alice'])
  })

  it('rejects archives missing the following file', async () => {
    const zip = new JSZip()
    zip.file('followers_1.json', '[]')
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'export.zip')
    await expect(parseInstagramZip(file)).rejects.toThrow(/Missing followers or following/)
  })

  it('compares two exports without claiming a definite unfollow', () => {
    const previous: Snapshot = { id: '1', importedAt: '', sourceName: '', followers: ['alice', 'bob'], following: ['bob'] }
    const current: Snapshot = { id: '2', importedAt: '', sourceName: '', followers: ['bob', 'charlie'], following: ['bob'] }
    expect(analyze(current, previous).gained).toEqual(['charlie'])
    expect(analyze(current, previous).lost).toEqual(['alice'])
  })

  it('reads followers from the wrapped JSON variant', () => {
    expect(extractUsernames({ relationships_followers: [{ string_list_data: [{ value: 'Jane.Doe' }] }] })).toEqual(['jane.doe'])
  })
})
