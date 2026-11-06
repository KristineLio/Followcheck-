import { compareSets, makeCsv, makeSampleData, parseInstagramZip } from './instagram.js';
import { allSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots } from './storage.js';

const $ = selector => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const cleanAccount = value => value.trim().replace(/^@/, '').toLowerCase();
const validAccount = value => /^[a-z0-9._-]{1,48}$/.test(value);
const date = value => new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
const cats = {
  notFollowingBack: "Don't follow me back",
  mutual: 'Mutual connections',
  iDontFollowBack: "I don't follow back",
  followers: 'All followers',
  following: 'All following',
  gained: 'New since last import',
  missing: 'Missing since last import',
};
const state = {
  snapshots:[], account:'', current:null, previous:null, demo:false,
  insights:null, category:'notFollowingBack', search:'', limit:75,
};

function say(message, kind='info') {
  const box = $('#fc-status');
  box.textContent = message;
  box.className = `fc-status ${kind}`;
  box.hidden = !message;
  if (kind === 'error') box.setAttribute('role','alert'); else box.setAttribute('role','status');
}
function setLoading(value) {
  $('#fc-import').disabled = value;
  $('#fc-file').disabled = value;
  $('#fc-import').textContent = value ? 'Analyzing ZIP…' : 'Analyze my ZIP';
}
function selectAccountOptions() {
  const select = $('#fc-account-select');
  const all = [...new Set(state.snapshots.map(s => s.account))].sort();
  select.replaceChildren();
  for (const account of all) {
    const option = el('option', null, '@' + account);
    option.value = account;
    select.append(option);
  }
  select.hidden = !all.length || state.demo;
  $('#fc-account-label').hidden = !all.length || state.demo;
  if (!state.demo && all.length) select.value = all.includes(state.account) ? state.account : all[0];
}
function forAccount(account) {
  const list = state.snapshots.filter(s => s.account === account).sort((a,b)=> b.importedAt.localeCompare(a.importedAt));
  state.current = list[0] || null;
  state.previous = list[1] || null;
  state.account = account;
  state.demo = false;
  state.category = 'notFollowingBack';
  state.search = '';
  state.limit = 75;
  $('#fc-search').value = '';
  render();
}
function launchDemo() {
  const { current, previous } = makeSampleData();
  state.demo = true;
  state.current = current;
  state.previous = previous;
  state.account = current.account;
  state.category = 'notFollowingBack';
  state.search = '';
  state.limit = 75;
  $('#fc-search').value = '';
  say('You are viewing fictional sample data. No Instagram account is connected.', 'info');
  render();
  $('#analyze').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function renderMetrics() {
  const data = state.insights;
  const cells = [
    ['Followers', data.followers.length, 'Accounts in your followers export'],
    ['Following', data.following.length, 'Accounts in your following export'],
    ['Mutual circle', data.mutual.length, 'Appear in both lists'],
    ["Don't follow me back", data.notFollowingBack.length, 'Following list minus followers list'],
    ["I don't follow back", data.iDontFollowBack.length, 'Followers list minus following list'],
    ['Net change', state.previous ? (data.net > 0 ? '+' : '') + data.net : '—', state.previous ? `+${data.gained.length} new · ${data.missing.length} missing` : 'Import a second snapshot to compare'],
  ];
  const grid = $('#fc-metrics');
  grid.replaceChildren();
  for (const [label, value, info] of cells) {
    const node = el('div', 'fc-metric');
    node.append(el('span', 'fc-metric-name', label), el('strong', 'fc-metric-value', String(value)), el('small', 'fc-metric-desc', info));
    grid.append(node);
  }
}
function renderList() {
  const data = state.insights;
  const current = state.category;
  for (const button of document.querySelectorAll('[data-fc-category]')) {
    const selected = button.dataset.fcCategory === current;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('span').textContent = String(data[button.dataset.fcCategory].length);
  }
  const names = data[current].filter(name => name.includes(state.search));
  $('#fc-list-heading').textContent = `${cats[current]} (${names.length.toLocaleString()})`;
  const list = $('#fc-list');
  list.replaceChildren();
  for (const name of names.slice(0, state.limit)) {
    const link = el('a', 'fc-account-link');
    // All username strings are strictly normalized to Instagram's safe syntax.
    link.href = 'https://www.instagram.com/' + encodeURIComponent(name) + '/';
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    const avatar = el('span','fc-avatar', name.slice(0,2).toUpperCase());
    avatar.setAttribute('aria-hidden','true');
    const label = el('span','fc-username','@' + name);
    link.append(avatar, label, el('span','fc-profile-arrow','Open profile ↗'));
    list.append(link);
  }
  if (!names.length) list.append(el('p','fc-empty','No usernames in this category match your search.'));
  const more = $('#fc-more');
  more.hidden = names.length <= state.limit;
  more.textContent = `Show more (${Math.max(names.length - state.limit, 0).toLocaleString()} remaining)`;
  $('#fc-download').disabled = !names.length;
  $('#fc-download').textContent = `Export ${names.length.toLocaleString()} ${state.search ? 'filtered' : ''} usernames as CSV`;
}
function renderDiagnostics() {
  const current = state.current;
  const info = $('#fc-diagnostics'); info.replaceChildren();
  const warning = $('#fc-warning'); warning.hidden = false;
  if (state.demo) {
    warning.textContent = 'Fictional demo: numbers come from generated follower and following sets. They do not represent a real Instagram account.';
  } else if (current.coverage?.suspicious) {
    warning.textContent = `Possible incomplete Instagram export: follower dates begin ${current.coverage.earliestFollower}, but following records begin ${current.coverage.earliestFollowing}. The follow-back counts might be substantially wrong. Request an All time export before taking action.`;
    warning.classList.add('danger');
  } else if (current.format === 'HTML') {
    warning.textContent = 'HTML relationship exports do not expose reliable timestamp coverage. Completeness cannot be independently verified. Request All time and check your totals before acting.';
    warning.classList.remove('danger');
  } else {
    warning.textContent = 'These lists reflect your ZIP, not live Instagram. Completeness is not independently guaranteed; missing usernames are not proof someone deliberately unfollowed you.';
    warning.classList.remove('danger');
  }
  const pairs = [['Mode',state.demo ? 'Fictional sample' : current.format],['Local account label','@' + current.account],['Imported',date(current.importedAt)]];
  if (!state.demo) pairs.push(['ZIP filename', current.filename]);
  if (current.coverage) pairs.push(['Earliest follower date', current.coverage.earliestFollower || 'Unknown'], ['Earliest following date', current.coverage.earliestFollowing || 'Unknown']);
  for (const [key,value] of pairs) {
    const row=el('div','fc-diagnostic-row'); row.append(el('span',null,key),el('strong',null,value)); info.append(row);
  }
  for (const item of current.sourceFiles ?? []) {
    const row=el('div','fc-diagnostic-row'); row.append(el('span',null,item.kind),el('strong',null,`${item.name} · ${item.unique} usernames`)); info.append(row);
  }
}
function renderHistory() {
  const list = $('#fc-history'); list.replaceChildren();
  const items = state.demo ? [state.current, state.previous] : state.snapshots.filter(s=>s.account === state.account).sort((a,b)=>b.importedAt.localeCompare(a.importedAt));
  for (let i=0;i<items.length;i++) {
    const snap=items[i];
    const row=el('div','fc-history-row');
    const summary=el('div',null);
    summary.append(el('strong',null,`${date(snap.importedAt)}${i===0?' · Latest':''}`),el('small',null,`${snap.followers.length} followers · ${snap.following.length} following`));
    row.append(summary);
    if (!state.demo) {
      const button=el('button','fc-delete','Delete'); button.type='button';
      button.setAttribute('aria-label',`Delete snapshot imported ${date(snap.importedAt)}`);
      button.addEventListener('click',async()=>{
        if (!window.confirm('Delete this local snapshot permanently?')) return;
        try { await deleteSnapshot(snap.id); await reload(state.account); say('Snapshot deleted from this browser.','success'); }
        catch { say('Could not delete this snapshot.','error'); }
      });
      row.append(button);
    }
    list.append(row);
  }
  if (!state.previous) list.append(el('p','fc-muted','Import a second snapshot from this same labeled account to see changes.'));
  $('#fc-gained').textContent = state.previous ? `+${state.insights.gained.length} new` : '—';
  $('#fc-missing').textContent = state.previous ? `−${state.insights.missing.length} missing` : '—';
  $('#fc-net').textContent = state.previous ? `${state.insights.net >= 0 ? '+' : ''}${state.insights.net} net` : 'Not enough history';
  $('#fc-clear').hidden = state.demo || !state.snapshots.length;
}
function render() {
  selectAccountOptions();
  const hasData = Boolean(state.current);
  $('#fc-dashboard').hidden = !hasData;
  $('#fc-blank').hidden = hasData;
  $('#fc-exit-demo').hidden = !state.demo;
  $('#fc-mode').textContent = state.demo ? 'FICTIONAL SAMPLE DATA' : (hasData ? 'YOUR LOCAL INSTAGRAM EXPORT' : 'READY TO ANALYZE');
  if (!hasData) return;
  state.insights = compareSets(state.current, state.previous);
  $('#fc-current-account').textContent = '@' + state.current.account;
  renderMetrics(); renderList(); renderDiagnostics(); renderHistory();
}
async function reload(preferred='') {
  state.snapshots = await allSnapshots();
  const accounts = [...new Set(state.snapshots.map(s => s.account))];
  const account = accounts.includes(preferred) ? preferred : accounts[0] || '';
  forAccount(account);
}

async function handleImport(event) {
  event.preventDefault();
  const account = cleanAccount($('#fc-account').value);
  const file = $('#fc-file').files?.[0];
  if (!validAccount(account)) { say('Enter a local account label using letters, numbers, dots, underscores or hyphens (max 48 characters).','error'); return; }
  if (!file) { say('Choose the original Instagram .zip export first.','error'); return; }
  setLoading(true);
  say('Analyzing your ZIP locally. No file contents are uploaded.');
  try {
    const parsed = await parseInstagramZip(file, account);
    if (state.snapshots.some(s=>s.account===account && s.fingerprint === parsed.fingerprint)) {
      await reload(account);
      say('You already imported this exact ZIP for this account. Existing history was preserved.','info');
      return;
    }
    await saveSnapshot(parsed);
    await reload(account);
    say(`Import complete: ${parsed.followers.length} followers and ${parsed.following.length} following, calculated on your device.`, 'success');
    $('#fc-file').value = '';
    $('#fc-dashboard').scrollIntoView({ behavior: 'smooth', block:'start' });
  } catch (error) {
    say(error instanceof Error ? error.message : 'Could not analyze the ZIP. Your existing history is unchanged.', 'error');
  } finally { setLoading(false); }
}

$('#fc-form').addEventListener('submit', handleImport);
$('#fc-account-select').addEventListener('change', e=>forAccount(e.target.value));
$('#fc-demo').addEventListener('click',launchDemo);
for(const a of document.querySelectorAll('[data-followcheck-demo]')) a.addEventListener('click',event=>{ event.preventDefault(); launchDemo(); });
$('#fc-exit-demo').addEventListener('click',async()=>{
  state.demo = false;
  await reload();
  say('Sample exited. Upload your own ZIP or choose an existing local account.','info');
});
$('#fc-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLowerCase().replace(/^@/,'');state.limit=75;renderList();});
for(const button of document.querySelectorAll('[data-fc-category]')) button.addEventListener('click',()=>{state.category=button.dataset.fcCategory;state.limit=75;renderList();});
$('#fc-more').addEventListener('click',()=>{state.limit+=75;renderList();});
$('#fc-download').addEventListener('click',()=>{
  if (!state.insights) return;
  const names = state.insights[state.category].filter(s=>s.includes(state.search));
  const csv = makeCsv(names,state.account,cats[state.category]);
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=el('a'); link.href=url;
  link.download=`followcheck-${state.account}-${state.category}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
});
$('#fc-clear').addEventListener('click',async()=>{
  if (!window.confirm('Permanently delete ALL FollowCheck snapshots stored in this browser?')) return;
  try { await clearSnapshots(); await reload(); say('All local FollowCheck history has been deleted.','success'); }
  catch { say('Could not clear local history.','error'); }
});

reload().then(()=>say('Ready. Your ZIP stays in your browser.')).catch(()=>{
  state.current=null;render();say('Local history is unavailable. Enable browser storage and reload to save snapshots.','error');
});