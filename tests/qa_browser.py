from pathlib import Path
import os
from playwright.sync_api import sync_playwright

BASE='http://127.0.0.1:8765/'
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures'

def run():
  checks=[]
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=os.environ.get("CHROME_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    ctx=browser.new_context(accept_downloads=True,viewport={'width':1365,'height':860})
    page=ctx.new_page()
    errors=[]; requests=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.on('request',lambda req: requests.append((req.method,req.url)))
    page.goto(BASE,wait_until='domcontentloaded')
    page.locator('.hero-actions [data-followcheck-demo]').click()
    assert page.locator('#demo').count()==0
    assert page.locator('#fc-demo-guide').is_visible()
    assert page.locator('#fc-dashboard').is_visible()
    page.locator('#fc-dashboard').wait_for(state='visible')
    assert '1,250' in page.locator('#fc-metrics').inner_text()
    assert page.locator('[data-fc-category="notFollowingBack"] span').inner_text() == '186'
    assert page.locator('[data-fc-category="mutual"] span').inner_text() == '654'
    assert '+34' in page.locator('#fc-gained').inner_text()
    checks.append('hero CTA opens true calculated demo, no duplicate static demo')
    assert '+22' in page.locator('#fc-comparison-summary').inner_text()
    page.locator('[data-fc-tour=changes]').click()
    assert page.locator('#fc-list-heading').inner_text()=='New since last import (34)'
    with page.expect_download() as dl: page.locator('[data-fc-tour=export]').click()
    assert 'watching.0001' in dl.value.path().read_bytes().decode('utf-8-sig')
    with page.expect_download() as dl: page.locator('#fc-full-report').click()
    full=dl.value.path().read_bytes().decode('utf-8-sig')
    assert '"summary","Net followers","","22"' in full
    assert '"summary","Mutual","","654"' in full
    checks.append('demo tour + consolidated full-report CSV')
    page.locator('[data-fc-category="iDontFollowBack"]').click()
    assert page.locator('#fc-list-heading').inner_text() == "I don't follow back (596)"
    page.locator('#fc-search').fill('audience.0001')
    assert page.locator('#fc-list-heading').inner_text() == "I don't follow back (1)"
    with page.expect_download() as dl: page.locator('#fc-download').click()
    csv=dl.value.path().read_bytes().decode('utf-8-sig')
    assert 'audience.0001' in csv and 'audience.0002' not in csv
    checks.append('search, filters, CSV')
    page.locator('#fc-exit-demo').click()
    page.locator('.hero-actions [data-followcheck-upload]').click()
    assert page.locator('#fc-account').evaluate('(e)=>document.activeElement===e')
    checks.append('upload CTA focuses real ZIP form')
    page.locator('#fc-account').fill('demo-account-a')
    page.locator('#fc-file').set_input_files(str(FIX/'01_baseline_JSON.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='Import complete').wait_for()
    assert page.locator('#fc-current-account').inner_text()=='@demo-account-a'
    assert page.locator('[data-fc-category="mutual"] span').inner_text()=='2'
    assert page.locator('[data-fc-category="iDontFollowBack"] span').inner_text()=='3'
    checks.append('JSON ZIP baseline import')
    page.locator('#fc-file').set_input_files(str(FIX/'02_update_JSON_same_account.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='Import complete').wait_for()
    assert page.locator('#fc-gained').inner_text()=='+2 new'
    assert page.locator('#fc-missing').inner_text()=='−1 missing'
    assert page.locator('#fc-net').inner_text()=='+1 net'
    assert 'Comparing two' in page.locator('#fc-comparison-summary').inner_text()
    checks.append('same-account update +2, -1, net +1')
    page.reload()
    assert page.locator('#fc-net').inner_text()=='+1 net'
    checks.append('IndexedDB persistence after reload')
    page.locator('#fc-file').set_input_files(str(FIX/'04_invalid_missing_following.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='ZIP needs both').wait_for()
    assert page.locator('#fc-gained').inner_text()=='+2 new'
    checks.append('invalid ZIP rejection preserves previous valid data')
    page.locator('#fc-account').fill('demo-account-b')
    page.locator('#fc-file').set_input_files(str(FIX/'03_baseline_HTML.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='Import complete').wait_for()
    assert page.locator('[data-fc-category="mutual"] span').inner_text()=='2'
    assert page.locator('#fc-net').inner_text()=='Not enough history'
    assert 'HTML' in page.locator('#fc-diagnostics').inner_text()
    checks.append('HTML ZIP import, split followers and isolated account')
    page.locator('#fc-account').fill('demo-account-c')
    page.locator('#fc-file').set_input_files(str(FIX/'05_different_account_JSON.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='Import complete').wait_for()
    assert page.locator('#fc-net').inner_text()=='Not enough history'
    checks.append('separate account has no cross-account comparisons')
    page.locator('#fc-account').fill('demo-account-d')
    page.locator('#fc-file').set_input_files(str(FIX/'06_date_limited_warning_JSON.zip'))
    page.locator('#fc-import').click()
    page.locator('#fc-status').filter(has_text='Import complete').wait_for()
    assert 'Possible incomplete' in page.locator('#fc-warning').inner_text()
    checks.append('date limited warnings')
    page.screenshot(path=str(ROOT/'desktop-live.png'),full_page=True)
    page.on('dialog',lambda d:d.accept())
    page.locator('#fc-clear').click()
    assert page.locator('#fc-dashboard').is_hidden()
    checks.append('delete all local snapshot history')
    assert not errors, errors
    assert not any(method=='POST' or ('?' in url and 'instagram' in url.lower()) for method,url in requests)
    checks.append('no unexpected network submissions or page errors')
    ctx.close();browser.close()
    mobile=p.chromium.launch(headless=True, executable_path=os.environ.get("CHROME_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    mctx=mobile.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=2,accept_downloads=True)
    mpage=mctx.new_page()
    page.goto(BASE,wait_until='domcontentloaded')
    page.locator('.hero-actions [data-followcheck-demo]').click()
    assert page.locator('#demo').count()==0
    assert page.locator('#fc-demo-guide').is_visible()
    assert page.locator('#fc-dashboard').is_visible()
    assert page.locator('#fc-dashboard').is_visible()
    width=page.evaluate('document.documentElement.scrollWidth'); win=page.evaluate('window.innerWidth')
    assert width <= win+1,(width,win)
    page.screenshot(path=str(ROOT/'mobile-live.png'),full_page=True)
    checks.append('390px mobile viewport, no horizontal overflow')
    mctx.close();mobile.close()
  print('PASS',len(checks),'checks:')
  for c in checks: print('  -',c)

if __name__=='__main__':run()