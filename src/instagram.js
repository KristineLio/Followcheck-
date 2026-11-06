import { readZipEntries } from './zip.js';
const USERNAME = /^[a-z0-9._]{1,30}$/;
const DAY = 86400;

export function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().replace(/^@/, '').toLowerCase();
  return USERNAME.test(v) ? v : null;
}

function records(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data).filter(Array.isArray).flat();
  return [];
}

export function parseJsonRelationships(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('An Instagram JSON file is invalid. Please request a fresh export.'); }
  if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object')) throw new Error('Instagram JSON does not contain relationship records.');
  const usernames = new Set();
  const timestamps = [];
  for (const record of records(parsed)) {
    if (!record || typeof record !== 'object') continue;
    for (const value of [record.title, record.username]) {
      const name = normalizeName(value);
      if (name) usernames.add(name);
    }
    if (Array.isArray(record.string_list_data)) for (const item of record.string_list_data) {
      if (!item || typeof item !== 'object') continue;
      const name = normalizeName(item.value);
      if (name) usernames.add(name);
      const time = item.timestamp;
      if (typeof time === 'number' && Number.isInteger(time) && time > 946684800 && time < 4102444800) timestamps.push(time);
    }
  }
  return { usernames: [...usernames], timestamps };
}

export function parseHtmlRelationships(raw) {
  if (!/<html[\s>]/i.test(raw)) throw new Error('HTML file is not an Instagram export.');
  if (typeof DOMParser !== 'function') throw new Error('This browser cannot parse Instagram HTML exports.');
  // Strip active and resource-loading tags before DOM parsing. Never attach the parsed document.
  const safe = raw.replace(/<(?:script|style|iframe|object|embed|img|link|audio|video|source|picture|svg|form)\b[^>]*>/gi, '');
  const doc = new DOMParser().parseFromString(safe, 'text/html');
  const usernames = new Set();
  const excluded = new Set(['accounts', 'explore', 'reel', 'reels', 'stories', 'p', 'direct', 'about', 'legal', 'privacy', 'terms', 'developer']);
  for (const a of doc.querySelectorAll('a[href]')) {
    try {
      const url = new URL(a.getAttribute('href'));
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) continue;
      const parts = url.pathname.split('/').filter(Boolean);
      const candidate = parts.length === 1 ? parts[0] : parts.length === 2 && parts[0] === '_u' ? parts[1] : null;
      if (!candidate || excluded.has(candidate.toLowerCase())) continue;
      const name = normalizeName(decodeURIComponent(candidate));
      if (name) usernames.add(name);
    } catch { /* skip malformed or unrelated link */ }
  }
  return { usernames: [...usernames], timestamps: [] };
}

function coverage(followerTimes, followingTimes, followerCount, followingCount) {
  if (!followerTimes.length && !followingTimes.length) return null;
  let earliestFollower = Infinity;
  let earliestFollowing = Infinity;
  let latest = -Infinity;
  for (const t of followerTimes) { if (t < earliestFollower) earliestFollower = t; if (t > latest) latest = t; }
  for (const t of followingTimes) { if (t < earliestFollowing) earliestFollowing = t; if (t > latest) latest = t; }
  const suspicious = Number.isFinite(earliestFollower) && Number.isFinite(earliestFollowing) &&
    latest - earliestFollower <= 400 * DAY && earliestFollower - earliestFollowing >= 2 * 365 * DAY && followerCount * 2 < followingCount;
  const date = t => Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 10) : null;
  return { earliestFollower: date(earliestFollower), earliestFollowing: date(earliestFollowing), suspicious };
}

export function compareSets(current, previous = null) {
  const followers = new Set(current.followers);
  const following = new Set(current.following);
  const last = new Set(previous?.followers ?? []);
  const sort = arr => arr.sort((a,b)=>a.localeCompare(b));
  const mutual = sort([...following].filter(name => followers.has(name)));
  const notFollowingBack = sort([...following].filter(name => !followers.has(name)));
  const iDontFollowBack = sort([...followers].filter(name => !following.has(name)));
  const gained = previous ? sort([...followers].filter(name => !last.has(name))) : [];
  const missing = previous ? sort([...last].filter(name => !followers.has(name))) : [];
  return {
    followers: sort([...followers]), following: sort([...following]), mutual, notFollowingBack,
    iDontFollowBack, gained, missing, net: previous ? followers.size - last.size : null,
  };
}

export async function parseInstagramZip(file, account) {
  const entries = await readZipEntries(file);
  const hasPair = f => entries.some(e => e.format === f && e.kind === 'followers') && entries.some(e => e.format === f && e.kind === 'following');
  const format = hasPair('JSON') ? 'JSON' : hasPair('HTML') ? 'HTML' : null;
  if (!format) throw new Error('ZIP needs both followers and following in the same format. In Instagram, choose Followers and following → All time → HTML or JSON.');
  const followers = new Set(); const following = new Set();
  const followerTimes = []; const followingTimes = []; const files = [];
  for (const entry of entries.filter(e => e.format === format)) {
    const content = await entry.text();
    const parsed = format === 'JSON' ? parseJsonRelationships(content) : parseHtmlRelationships(content);
    const target = entry.kind === 'followers' ? followers : following;
    const times = entry.kind === 'followers' ? followerTimes : followingTimes;
    for (const name of parsed.usernames) target.add(name);
    times.push(...parsed.timestamps);
    files.push({ name: entry.name, kind: entry.kind, unique: parsed.usernames.length });
  }
  const buffer = await file.arrayBuffer();
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
  return {
    id: crypto.randomUUID(), account, importedAt: new Date().toISOString(), filename: file.name, format, fingerprint,
    followers: [...followers].sort(), following: [...following].sort(), sourceFiles: files,
    coverage: format === 'JSON' ? coverage(followerTimes, followingTimes, followers.size, following.size) : null,
  };
}

export function makeSampleData() {
  const make = (prefix, count) => Array.from({ length: count }, (_,i) => `${prefix}.${String(i + 1).padStart(4, '0')}`);
  const mutual = make('friend', 654);
  const notFollowing = make('watching', 186);
  const audience = make('audience', 596);
  const current = { id:'demo-current', account:'sample-instagram', importedAt:'2026-11-06T00:00:00Z', format:'SAMPLE', followers:[...mutual,...audience].sort(), following:[...mutual,...notFollowing].sort() };
  const previous = { ...current, id:'demo-previous', importedAt:'2026-10-06T00:00:00Z', followers:[...current.followers.filter(v => !audience.slice(0,34).includes(v)), ...make('former',12)].sort() };
  return { current, previous };
}

export function makeCsv(users, account, label) {
  const escape = value => { const text = String(value); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return '"' + safe.replace(/"/g, '""') + '"'; };
  return '\ufeff' + [ ['username','account','category'], ...users.map(user => [user, account, label]) ].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}


/** Consolidated, formula-safe CSV: summary totals plus all important relationship/change lists. */
export function makeFullReportCsv(insights, account, current, previous = null) {
  const escape = value => {
    const v = String(value ?? '');
    const protectedValue = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
    return '"' + protectedValue.replace(/"/g, '""') + '"';
  };
  const at = date => date ? String(date) : '';
  const groups = [
    ['followers', 'All followers'],
    ['following', 'All following'],
    ['mutual', 'Mutual'],
    ['notFollowingBack', "Don't follow me back"],
    ['iDontFollowBack', "I don't follow back"],
  ];
  if (previous) groups.push(['gained', 'New since previous export'], ['missing', 'Missing since previous export']);
  const rows = [['row_type', 'category', 'username', 'count', 'account', 'current_import', 'previous_import']];
  for (const [key, label] of groups) {
    rows.push(['summary', label, '', insights[key].length, account, at(current.importedAt), at(previous?.importedAt)]);
    for (const username of insights[key]) rows.push(['account', label, username, '', account, at(current.importedAt), at(previous?.importedAt)]);
  }
  if (previous) rows.push(['summary', 'Net followers', '', insights.net, account, at(current.importedAt), at(previous.importedAt)]);
  return '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}