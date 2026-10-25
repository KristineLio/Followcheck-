import { useEffect, useMemo, useRef, useState } from 'react'
import { analyze, parseInstagramZip, type Snapshot } from './instagram'
import { addSnapshot, clearSnapshots, getSnapshots } from './storage'

type Tab = 'overview' | 'accounts' | 'history'
type Filter = 'notFollowingBack' | 'youDontFollowBack' | 'mutual'

const filters: { key: Filter; label: string }[] = [
  { key: 'notFollowingBack', label: "Don't follow back" },
  { key: 'youDontFollowBack', label: "You don't follow" },
  { key: 'mutual', label: 'Mutual' },
]

function dateLabel(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function Icon({ name, size = 20 }: { name: 'upload' | 'people' | 'chart' | 'clock' | 'shield' | 'arrow' | 'search' | 'info' | 'spark' | 'profile'; size?: number }) {
  const strokes: Record<typeof name, React.ReactNode> = {
    upload: <><path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/></>,
    chart: <><path d="M3 19V5m0 14h18M6 15l5-5 4 3 5-7"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    shield: <><path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
    spark: <><path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1z"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.6-7 8-7s8 2.5 8 7"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{strokes[name]}</svg>
}

function Metric({ title, value, tone, footer }: { title: string; value: string | number; tone: string; footer: string }) {
  return <div className="metric"><span className="metric-title">{title}</span><span className={'metric-value ' + tone}>{value}</span><span className="metric-footer">{footer}</span></div>
}

function AccountList({ users, search, onSearch }: { users: string[]; search: string; onSearch: (term: string) => void }) {
  const [limit, setLimit] = useState(40)
  useEffect(() => setLimit(40), [search, users])
  const filtered = useMemo(() => users.filter((name) => name.includes(search.trim().toLowerCase().replace(/^@/, ''))), [users, search])
  return <>
    <label className="searchbox"><Icon name="search" size={19}/><input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search usernames" aria-label="Search usernames" /></label>
    <div className="profile-photo-note" role="note"><Icon name="info" size={18}/><span>Instagram exports don't include profile pictures. Tap any account to view its real, current photo on Instagram.</span></div>
    <div className="list-meta">{filtered.length.toLocaleString()} account{filtered.length === 1 ? '' : 's'}</div>
    {filtered.length === 0 ? <div className="empty-list">No matching accounts.</div> :
      <div className="account-list">{filtered.slice(0, limit).map((user) => <a key={user} className="account-row" href={'https://www.instagram.com/' + encodeURIComponent(user) + '/'} target="_blank" rel="noopener noreferrer" title={'Open @' + user + ' on Instagram to see the real profile picture'} aria-label={'View @' + user + ' profile picture on Instagram'}>
        <span className="avatar avatar-placeholder" aria-hidden="true"><Icon name="profile" size={21}/></span>
        <span className="account-identity"><strong className="account-handle">@{user}</strong><small>Tap to view photo on Instagram</small></span>
        <span className="profile-link">Open profile <Icon name="arrow" size={16}/></span>
      </a>)}</div>}
    {filtered.length > limit && <button className="secondary-button more-button" onClick={() => setLimit((n) => n + 40)}>Show more ({filtered.length - limit} remaining)</button>}
  </>
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState<Filter>('notFollowingBack')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getSnapshots().then(setSnapshots).catch(() => setError('Local storage is unavailable. Try enabling browser storage and reload.')).finally(() => setLoading(false))
  }, [])

  const current = snapshots[0]
  const previous = snapshots[1]
  const insights = useMemo(() => current ? analyze(current, previous) : null, [current, previous])

  async function handleUpload(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const next = await parseInstagramZip(file)
      await addSnapshot(next)
      setSnapshots(await getSnapshots())
      setTab('overview')
      setSearch('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export could not be processed.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function deleteHistory() {
    if (!window.confirm('Delete all saved FollowCheck snapshots from this browser? This cannot be undone.')) return
    try {
      await clearSnapshots()
      setSnapshots([])
      setTab('overview')
      setError('')
    } catch {
      setError('Could not clear local history. Try again or clear browser site data.')
    }
  }

  function chooseFile() { fileInput.current?.click() }

  return <div className="site">
    <input className="visually-hidden" ref={fileInput} type="file" accept=".zip,application/zip" aria-label="Select Instagram ZIP export" onChange={(event) => handleUpload(event.target.files?.[0])}/>
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setTab('overview') }}><span className="brand-mark">f<span className="brand-dot">.</span></span><span>followcheck</span></a>
        <div className="private-label"><Icon name="shield" size={14}/> PRIVATE BY DESIGN</div>
      </header>

      <main>
        {error && <div className="error" role="alert"><Icon name="info" size={20}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}

        {loading ? <div className="loading">Loading your private workspace…</div> : !current ? <>
          <section className="guide card guide-first" aria-labelledby="start-title">
            <span className="eyebrow">FIRST TIME HERE? START WITH THESE STEPS</span>
            <h1 className="guide-title" id="start-title">Find your followers in 3 steps<span className="period">.</span></h1>
            <p className="guide-subtitle">No Instagram password needed. We'll guide you through the export, then analyze it privately on your phone.</p>
            <div className="steps">
              <div><span>01</span><p><strong>Get your Instagram data</strong><br/>In Accounts Center, open Your information and permissions → Export your information.<br/><a className="inline-step-link" href="https://accountscenter.instagram.com/" target="_blank" rel="noopener noreferrer">Open Instagram Accounts Center <Icon name="arrow" size={15}/></a></p></div>
              <div><span>02</span><p><strong>Choose followers and following</strong><br/>Select Followers and following, then All time. <b>Keep HTML selected</b> (the default) or choose JSON — both are supported.</p></div>
              <div><span>03</span><p><strong>Upload your ZIP file</strong><br/>When Instagram makes your export available, save the ZIP to Files or Downloads and upload it below. Don't extract it.</p></div>
            </div>
            <div className="guide-actions">
              <button className="primary-button" disabled={busy} onClick={chooseFile}><Icon name="upload" size={19}/>{busy ? 'Analyzing your ZIP…' : 'Upload Instagram ZIP'}<Icon name="arrow" size={19}/></button>
              <div className="under-button"><Icon name="shield" size={14}/> Your files stay on this device.</div>
            </div>
          </section>
          <section className="welcome welcome-secondary">
            <div className="eyebrow"><span className="spark-icon"><Icon name="spark" size={14}/></span> YOUR INSTAGRAM, MADE CLEAR</div>
            <h2>Know your circle<span className="period">.</span></h2>
            <p>Find accounts that don't follow you back, discover mutual connections, and compare your followers over time.</p>
          </section>
          <div className="feature-row">
            <div className="feature"><span className="feature-icon pink"><Icon name="people"/></span><h3>See your connections</h3><p>Followers, mutuals, and one-way follows in one place.</p></div>
            <div className="feature"><span className="feature-icon lilac"><Icon name="chart"/></span><h3>Track your growth</h3><p>Compare exports to spot followers added or missing.</p></div>
            <div className="feature"><span className="feature-icon mint"><Icon name="shield"/></span><h3>Stay private</h3><p>No Instagram login, no server, and no tracking.</p></div>
          </div>
        </> : <>
          <section className="dashboard-header">
            <div><div className="eyebrow">YOUR PRIVATE DASHBOARD</div><h1>Your circle, <span>at a glance.</span></h1><p>Based on your most recently uploaded Instagram data.</p></div>
            <button className="upload-button" disabled={busy} onClick={chooseFile}><Icon name="upload" size={17}/>{busy ? 'Analyzing…' : 'New import'}</button>
          </section>
          <div className="snapshot-pill"><span className="status-dot"/> Last imported {dateLabel(current.importedAt)} <span className="pill-divider">·</span> {snapshots.length} saved snapshot{snapshots.length === 1 ? '' : 's'}</div>

          {tab === 'overview' && insights && <>
            <div className="metrics-grid">
              <Metric title="Your followers" value={current.followers.length.toLocaleString()} tone="dark" footer="Accounts following you"/>
              <Metric title="You're following" value={current.following.length.toLocaleString()} tone="dark" footer="Accounts you follow"/>
              <Metric title="Don't follow back" value={insights.notFollowingBack.length.toLocaleString()} tone="pink-text" footer="You follow them"/>
              <Metric title="Mutual connections" value={insights.mutual.length.toLocaleString()} tone="purple-text" footer="You follow each other"/>
            </div>
            <section className="highlight card">
              <div className="highlight-icon"><Icon name="people" size={24}/></div>
              <div><span className="eyebrow">ACCOUNT INSIGHTS</span><h2>{insights.notFollowingBack.length} don't follow you back</h2><p>See exactly which accounts you follow that aren't in your followers list.</p><button className="text-link as-button" onClick={() => { setFilter('notFollowingBack'); setTab('accounts') }}>Explore accounts <Icon name="arrow" size={17}/></button></div>
            </section>
            <section className="changes card">
              <div className="section-heading"><div><span className="eyebrow">GROWTH TRACKING</span><h2>Since your last import</h2></div><Icon name="chart" size={22}/></div>
              {previous ? <>
                <div className="change-row"><span>New in followers list</span><strong className="positive">+{insights.gained.length}</strong></div>
                <div className="change-row"><span>Missing from followers list</span><strong className="negative">−{insights.lost.length}</strong></div>
                <p className="small-note">Changes between imported lists aren't proof someone deliberately unfollowed you. Accounts may also be deactivated or renamed.</p>
              </> : <div className="no-history"><Icon name="clock" size={22}/><p>Import another Instagram export later to start comparing follower changes over time.</p></div>}
            </section>
          </>}

          {tab === 'accounts' && insights && <section className="accounts-page card">
            <div className="section-heading"><div><span className="eyebrow">YOUR CONNECTIONS</span><h2>Explore accounts</h2></div></div>
            <div className="filter-tabs" role="group" aria-label="Filter accounts">{filters.map((item) => <button key={item.key} className={filter === item.key ? 'active' : ''} onClick={() => { setFilter(item.key); setSearch('') }}>{item.label} <span>{insights[item.key].length}</span></button>)}</div>
            <AccountList users={insights[filter]} search={search} onSearch={setSearch}/>
          </section>}

          {tab === 'history' && insights && <section className="history-page card">
            <div className="section-heading"><div><span className="eyebrow">LOCAL HISTORY</span><h2>Your saved snapshots</h2></div><Icon name="clock" size={23}/></div>
            <p className="history-intro">Stored only in this browser. Import exports from the same Instagram account for meaningful comparisons.</p>
            <div className="history-items">{snapshots.map((snapshot, index) => <div className="history-item" key={snapshot.id}><span className="timeline-dot"/><div><strong>{dateLabel(snapshot.importedAt)} {index === 0 && <span className="latest-tag">Latest</span>}</strong><p>{snapshot.followers.length.toLocaleString()} followers · {snapshot.following.length.toLocaleString()} following</p></div></div>)}</div>
            <div className="history-actions"><button className="secondary-button" onClick={chooseFile} disabled={busy}><Icon name="upload" size={17}/> Add another export</button><button className="danger-button" onClick={deleteHistory}>Delete local history</button></div>
            <p className="small-note">Clearing browser data or using another device may erase this history. No cloud backup is enabled.</p>
          </section>}
        </>}

        {current && <div className="accuracy-note"><Icon name="info" size={18}/><p>Results reflect the exported data, not live Instagram activity. A missing account isn't necessarily a confirmed unfollow.</p></div>}
      </main>

      {current && <nav className="bottom-nav" aria-label="Main navigation">
        <button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}><Icon name="chart" size={21}/><span>Overview</span></button>
        <button className={tab === 'accounts' ? 'selected' : ''} onClick={() => setTab('accounts')}><Icon name="people" size={21}/><span>Accounts</span></button>
        <button className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}><Icon name="clock" size={21}/><span>History</span></button>
      </nav>}
      <footer><span>followcheck © {new Date().getFullYear()}</span><span>Made for clarity. Built for privacy.</span></footer>
    </div>
  </div>
}
