import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { analyze, extractHtmlUsernames, extractUsernames, parseInstagramZip, type Snapshot } from './instagram'

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
    expect(snap.sourceFiles).toEqual([{ name: 'followers_1.json', kind: 'followers', parsed: 2 }, { name: 'following.json', kind: 'following', parsed: 2 }])
    expect(snap.archiveIdentity).toContain('instagram.zip:')
    expect(snap.followers).toEqual(['alice', 'bob'])
    expect(snap.following).toEqual(['bob', 'charlie'])
    expect(analyze(snap).notFollowingBack).toEqual(['charlie'])
    expect(analyze(snap).mutual).toEqual(['bob'])
    expect(analyze(snap).youDontFollowBack).toEqual(['alice'])
  })

  it('rejects archives missing the following file', async () => {
    const zip = new JSZip()
    zip.file('followers_1.json', '[]')
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'export.zip')
    await expect(parseInstagramZip(file)).rejects.toThrow(/complete Followers and Following/)
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

describe('Default HTML Instagram ZIP exports', () => {
  const makeHtml = (names: string[]) =>
    '<!doctype html><html><body><h1>Instagram relationships</h1>' +
    names.map((name) => '<div class="_a6-p"><a target="_blank" href="https://www.instagram.com/' + name + '/">' + name + '</a><div>Oct 25, 2026</div></div>').join('') +
    '</body></html>'

  it('reads profile links but ignores navigation, external hosts, and date text', () => {
    const markup = makeHtml(['Alice', 'bob._2', 'Alice'])
      .replace('</body>', '<a href="https://www.instagram.com/accounts/login/">Login</a><a href="https://www.instagram.com/_u/Charlie">Charlie</a><a href="https://www.instagram.com.evil.example/fake">Fake</a><a href="javascript:alert(1)">bad</a></body>')
    expect(extractHtmlUsernames(markup)).toEqual(['alice', 'bob._2', 'charlie'])
  })

  it('imports split HTML follower lists and following.html without manual extraction', async () => {
    const zip = new JSZip()
    zip.file('instagram/connections/followers_and_following/followers_1.html', makeHtml(['Alicia', 'bobby']))
    zip.file('instagram/connections/followers_and_following/followers_2.html', makeHtml(['ALICIA', 'dora']))
    zip.file('instagram/connections/followers_and_following/following.html', makeHtml(['bobby', 'Charlie']))
    zip.file('instagram/connections/followers_and_following/pending_follow_requests.html', makeHtml(['ignore_me']))
    const blob = await zip.generateAsync({ type: 'blob' })
    const snapshot = await parseInstagramZip(new File([blob], 'instagram-export.zip'))
    expect(snapshot.sourceFiles?.filter((entry) => entry.kind === 'followers')).toHaveLength(2)
    expect(snapshot.format).toBe('HTML')
    expect(snapshot.followers).toEqual(['alicia', 'bobby', 'dora'])
    expect(snapshot.following).toEqual(['bobby', 'charlie'])
    expect(analyze(snapshot).notFollowingBack).toEqual(['charlie'])
  })

  it('prefers a complete HTML pair over a partial JSON export', async () => {
    const zip = new JSZip()
    zip.file('followers_1.html', makeHtml(['alice']))
    zip.file('following.html', makeHtml(['bob']))
    zip.file('followers_1.json', JSON.stringify([{ string_list_data: [{ value: 'incorrect' }] }]))
    const blob = await zip.generateAsync({ type: 'blob' })
    const snapshot = await parseInstagramZip(new File([blob], 'instagram.zip'))
    expect(snapshot.format).toBe('HTML')
    expect(snapshot.followers).toEqual(['alice'])
    expect(snapshot.following).toEqual(['bob'])
  })

  it('rejects archives without both files in the same format', async () => {
    const zip = new JSZip()
    zip.file('followers_1.html', makeHtml(['alice']))
    zip.file('following.json', JSON.stringify({ relationships_following: [] }))
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(parseInstagramZip(new File([blob], 'instagram.zip'))).rejects.toThrow(/complete Followers and Following/)
  })
})
