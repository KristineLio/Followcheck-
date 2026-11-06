"""Offline Chromium smoke tests when navigation is administratively blocked.

Uses a minimal in-memory storage shim and test-only WebCrypto digest to exercise
DOM, import UI, filters, two-snapshot changes and exports without navigation.
Real browser persistence and actual browser SHA-256 are NOT covered here.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures'
HTML=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="app.css">','').replace('<script type="module" src="src/app.js"></script>','')
CSS=(ROOT/'app.css').read_text()
def js(path):
  s=(ROOT/path).read_text()
  return s.replace('export async function ','async function ').replace('export function ','function ').replace("import { readZipEntries } from './zip.js';",'').replace("import { compareSets, makeCsv, makeFullReportCsv, makeSampleData, parseInstagramZip } from './instagram.js';",'').replace("import { allSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots } from './storage.js';",'')
MEMORY='''
let __snapshots=[];
async function allSnapshots(){return [...__snapshots]}
async function saveSnapshot(x){__snapshots.push(x)}
async function deleteSnapshot(id){__snapshots=__snapshots.filter(x=>x.id!==id)}
async function clearSnapshots(){__snapshots=[]}
Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>`test-${Math.random()}`});
Object.defineProperty(window.crypto,'subtle',{configurable:true,value:{digest:async(_alg,buffer)=>{const b=new Uint8Array(buffer);let sum=2166136261>>>0;for(const x of b){sum^=x;sum=Math.imul(sum,16777619)>>>0;}const a=new Uint8Array(32);new DataView(a.buffer).setUint32(0,sum);return a.buffer;}}});
'''
BUNDLE=MEMORY+'\n'+js('src/zip.js')+'\n'+js('src/instagram.js')+'\n'+js('src/app.js')

def setup(browser, viewport=(1365,860), mobile=False):
  ctx=browser.new_context(accept_downloads=True, viewport={'width':viewport[0],'height':viewport[1]},is_mobile=mobile,device_scale_factor=2 if mobile else 1)
  page=ctx.new_page(); errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(HTML)
  page.add_style_tag(content=CSS)
  page.add_script_tag(content=BUNDLE)
  return ctx,page,errors

with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  ctx,page,errs=setup(b)
  checks=[]
  assert page.locator('#demo').count()==0
  assert page.locator('#analyze').count()==1
  assert page.locator('main section').nth(1).get_attribute('id')=='analyze'
  checks.append('live workspace immediately follows the hero')
  page.locator('.hero-actions [data-followcheck-demo]').click()
  assert page.locator('#fc-dashboard').is_visible()
  assert page.locator('#fc-demo-guide').is_visible()
  assert page.locator('[data-fc-category=notFollowingBack] span').inner_text()=='186'
  assert '+22' in page.locator('#fc-comparison-summary').inner_text()
  assert "Don't follow me back" in page.locator('#fc-metrics').inner_text()
  checks.append('hero launches actual dynamic demo and highlights history')
  page.locator('[data-fc-tour=changes]').click()
  assert page.locator('#fc-list-heading').inner_text()=='New since last import (34)'
  with page.expect_download() as dl: page.locator('[data-fc-tour=export]').click()
  assert 'watching.0001' in dl.value.path().read_bytes().decode('utf-8-sig')
  with page.expect_download() as dl: page.locator('#fc-full-report').click()
  full=dl.value.path().read_bytes().decode('utf-8-sig')
  assert '"summary","Net followers","","22"' in full
  checks.append('guided sample category controls and consolidated CSV export')
  page.screenshot(path=str(ROOT/'top3-desktop.png'),full_page=True)
  page.locator('#fc-exit-demo').click()
  page.locator('.hero-actions [data-followcheck-upload]').click()
  assert page.locator('#fc-account').evaluate('(e)=>document.activeElement===e')
  checks.append('upload action focuses form')
  page.locator('#fc-account').fill('demo-account-a')
  page.locator('#fc-file').set_input_files(str(FIX/'01_baseline_JSON.zip'))
  page.locator('#fc-import').click()
  page.locator('#fc-status').filter(has_text='Import complete').wait_for()
  assert page.locator('[data-fc-category=mutual] span').inner_text()=='2'
  assert 'One snapshot' in page.locator('#fc-comparison-summary').inner_text()
  assert page.locator('#fc-next-snapshot').is_visible()
  checks.append('real JSON ZIP: correct mutual counts and second-snapshot guidance')
  page.locator('#fc-file').set_input_files(str(FIX/'02_update_JSON_same_account.zip'))
  page.locator('#fc-import').click()
  page.locator('#fc-status').filter(has_text='Import complete').wait_for()
  assert '+1 net'==page.locator('#fc-net').inner_text()
  assert '+2 new'==page.locator('#fc-gained').inner_text()
  assert page.locator('#fc-next-snapshot').is_hidden()
  checks.append('two real ZIPs: +2 gained, -1 missing, +1 net')
  page.locator('#fc-file').set_input_files(str(FIX/'04_invalid_missing_following.zip'))
  page.locator('#fc-import').click()
  page.locator('#fc-status').filter(has_text='ZIP needs both').wait_for()
  assert page.locator('#fc-net').inner_text()=='+1 net'
  checks.append('invalid ZIP rejected without replacing valid snapshot')
  page.locator('#fc-account').fill('different-account')
  page.locator('#fc-file').set_input_files(str(FIX/'03_baseline_HTML.zip'))
  page.locator('#fc-import').click()
  page.locator('#fc-status').filter(has_text='Import complete').wait_for()
  assert page.locator('#fc-net').inner_text()=='Not enough history'
  assert 'HTML' in page.locator('#fc-diagnostics').inner_text()
  checks.append('HTML ZIP import and cross-account isolation')
  assert not errs,errs
  ctx.close()
  mctx,mpage,merrs=setup(b,viewport=(390,844),mobile=True)
  mpage.locator('.hero-actions [data-followcheck-demo]').click()
  assert mpage.locator('#fc-dashboard').is_visible()
  width=mpage.evaluate('document.documentElement.scrollWidth')
  win=mpage.evaluate('window.innerWidth')
  assert width<=win+1,(width,win)
  mpage.screenshot(path=str(ROOT/'top3-mobile.png'),full_page=True)
  checks.append('390px mobile width, no overflow')
  assert not merrs,merrs
  mctx.close();b.close()
print('PASS',len(checks),'offline DOM smoke checks:')
for c in checks: print('  -',c)