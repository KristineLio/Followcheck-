import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSets, makeCsv, makeSampleData, parseInstagramZip } from '../src/instagram.js';

const fixture = async name => {
  const bytes = await readFile(new URL('./fixtures/' + name, import.meta.url));
  return new File([bytes], name, { type:'application/zip' });
};
const load = async (name,account) => parseInstagramZip(await fixture(name), account);

test('baseline JSON has expected followers, mutual and non-mutual lists', async()=>{
 const s=await load('01_baseline_JSON.zip','demo-account-a');
 const d=compareSets(s);
 assert.equal(d.followers.length,5); assert.equal(d.following.length,4);
 assert.deepEqual(d.mutual,['alpha.test','bravo.test']);
 assert.deepEqual(d.notFollowingBack,['foxtrot.test','golf.test']);
 assert.deepEqual(d.iDontFollowBack,['charlie.test','delta.test','echo.test']);
 assert.equal(d.net,null);
});
test('same-account second ZIP computes gained, missing, net', async()=>{
 const first=await load('01_baseline_JSON.zip','demo-account-a');
 const next=await load('02_update_JSON_same_account.zip','demo-account-a');
 const d=compareSets(next,first);
 assert.equal(d.followers.length,6);assert.equal(d.following.length,4);
 assert.equal(d.mutual.length,1);assert.equal(d.notFollowingBack.length,3);assert.equal(d.iDontFollowBack.length,5);
 assert.deepEqual(d.gained,['hotel.test','india.test']);
 assert.deepEqual(d.missing,['alpha.test']);assert.equal(d.net,1);
});
test('missing following file is rejected',async()=>{
 await assert.rejects(load('04_invalid_missing_following.zip','demo-account-a'),/both followers and following/);
});
test('different-account fixture itself has expected lists',async()=>{
 const s=await load('05_different_account_JSON.zip','demo-account-c');
 const d=compareSets(s); assert.deepEqual([d.followers.length,d.following.length,d.mutual.length,d.notFollowingBack.length,d.iDontFollowBack.length],[2,2,1,1,1]);
});
test('date limited JSON warning triggers',async()=>{
 const s=await load('06_date_limited_warning_JSON.zip','demo-account-d');
 assert.equal(s.coverage?.suspicious,true);
 assert.deepEqual([s.followers.length,s.following.length],[2,8]);
});
test('demo sets produce precise and mutually consistent counts',()=>{
 const {current,previous}=makeSampleData();
 const d=compareSets(current,previous);
 assert.deepEqual([d.followers.length,d.following.length,d.mutual.length,d.notFollowingBack.length,d.iDontFollowBack.length,d.gained.length,d.missing.length,d.net],[1250,840,654,186,596,34,12,22]);
});
test('CSV includes a header and safely quotes content',()=>{
 const csv=makeCsv(['alpha.test','bravo.test'],'demo-account-a','Mutual');
 assert.ok(csv.startsWith('\ufeff"username","account","category"\r\n'));
 assert.ok(csv.includes('"alpha.test","demo-account-a","Mutual"'));
});