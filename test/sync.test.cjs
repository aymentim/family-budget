const {chromium}=require('playwright');
const BASE='http://localhost:8970/';
const num=s=>Number(String(s).replace(/,/g,'').match(/-?\d+(\.\d+)?/)[0]);
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
const mk=async(shift)=>{const c=await b.newContext({viewport:{width:390,height:844}});
  if(shift)await c.addInitScript(sh=>{const R=Date;const off=sh*31*864e5;class D extends R{constructor(...a){super(...(a.length?a:[R.now()+off]));}static now(){return R.now()+off;}}globalThis.Date=D;},shift);
  await c.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());const p=await c.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(BASE);return {c,p};};
const login=async(p,pass)=>{await p.fill('#g-pass',pass);await p.click('#gateForm button[type=submit]');await p.waitForTimeout(400);};
const addTx=async(p,kind,amt,cat)=>{await p.click('.fab');await p.click(`[data-kind="${kind}"]`);await p.fill('#f-amount',String(amt));if(cat)await p.click(`#catWrap .chip:has-text("${cat}")`);await p.click('#txForm button[type=submit]');
  if(!(await p.$('#sheet[hidden]')))await p.click('#txForm button[type=submit]');};
const envRes=async p=>{await p.click('.nav-btn[data-tab="env"]');const a=await p.$$eval('.env .amt',e=>e.map(x=>x.textContent));return a.map(num);};
const txCount=async p=>{await p.click('.nav-btn[data-tab="tx"]');return (await p.$$('.tx')).length;};
const waitSynced=async p=>{for(let i=0;i<40;i++){const s=await p.$eval('#syncDot',e=>e.dataset.s).catch(()=>null);if(s==='ok')return true;await p.waitForTimeout(250);}return false;};
const pull=async p=>{await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(900);};

const A=await mk(0);ok(await A.p.isVisible('#gate'),'A: login screen shows first');
await login(A.p,'wrong');ok((await A.p.textContent('#g-err')).includes('غلط'),'A: wrong password rejected');
await login(A.p,'test-pass-123');ok(!(await A.p.isVisible('#gateForm')),'A: logged in');
ok(await A.p.isVisible('[data-action="start"]'),'A: setup card on first use');
await A.p.fill('#su-open','9000');await A.p.fill('#su-m0','أيمن');await A.p.fill('#su-m1','سارة');await A.p.click('[data-action="start"]');
await A.p.waitForTimeout(300);ok(await A.p.isVisible('#pickMe'),'A: asks who am I');await A.p.click('#pickBtns [data-me="0"]');
ok(await waitSynced(A.p),'A: saved to server');
let [h,r,g]=await envRes(A.p);ok(r===5800&&h===3200,`A: reservoir 5800 house 3200 (got ${r}/${h})`);

const B=await mk(0);await login(B.p,'test-pass-123');await B.p.waitForTimeout(300);
ok(await B.p.isVisible('#pickMe'),'B: asks who am I');await B.p.click('#pickBtns [data-me="1"]');
[h,r,g]=await envRes(B.p);ok(r===5800&&h===3200,`B: sees same numbers (got ${r}/${h})`);

// both record at the same time
await Promise.all([addTx(A.p,'exp',120,'أكل وخضرة'),addTx(B.p,'inc',2000)]);
await Promise.all([waitSynced(A.p),waitSynced(B.p)]);await pull(A.p);await pull(B.p);await pull(A.p);
const ca=await txCount(A.p), cb=await txCount(B.p);ok(ca===cb&&ca===3,`both phones show 3 entries (A ${ca}, B ${cb})`);
[h,r]=await envRes(A.p);const [hb,rb]=await envRes(B.p);ok(h===hb&&r===rb,`same totals on both (A ${r}/${h}, B ${rb}/${hb})`);
ok(r===7800&&h===3080,`totals correct: reservoir 7800, house 3080 (got ${r}/${h})`);
await B.p.click('.nav-btn[data-tab="tx"]');const whoB=await B.p.$$eval('.tx .meta',e=>e.map(x=>x.textContent).join('|'));ok(whoB.includes('أيمن')&&whoB.includes('سارة'),'entries carry who recorded them');

// B deletes A's expense
await B.p.click('.nav-btn[data-tab="tx"]');await B.p.click('.tx:has-text("أكل وخضرة") [data-action="del"]');await waitSynced(B.p);await pull(A.p);
ok(await txCount(A.p)===2,'delete on B reaches A');

// offline entry on A
await A.c.setOffline(true);await addTx(A.p,'exp',75,'طلعات');await A.p.waitForTimeout(1200);
ok((await A.p.$eval('#syncDot',e=>e.dataset.s))==='offline','A: shows offline, keeps entry');
await A.c.setOffline(false);await A.p.evaluate(()=>window.dispatchEvent(new Event('online')));ok(await waitSynced(A.p),'A: syncs after coming back online');
await pull(B.p);ok(await txCount(B.p)===3,'offline entry reaches B');

// burst: 8 entries each at once
for(let i=0;i<8;i++){await Promise.all([addTx(A.p,'exp',10,'أكل وخضرة'),addTx(B.p,'exp',10,'طلعات')]);}
await Promise.all([waitSynced(A.p),waitSynced(B.p)]);await pull(A.p);await pull(B.p);await pull(A.p);
ok(await txCount(A.p)===19&&await txCount(B.p)===19,`burst: no lost entries (A ${await txCount(A.p)}, B ${await txCount(B.p)})`);

// settings edit on B reaches A
await B.p.click('[data-tab-go="set"] >> nth=0');await B.p.fill('#b-flex','600');await B.p.click('#m-0');await waitSynced(B.p);await pull(A.p);
await A.p.click('[data-tab-go="set"] >> nth=0');ok((await A.p.inputValue('#b-flex'))==='600','settings change reaches the other phone');

// next month: two phones open together after the month ended
const C=await mk(1), D=await mk(1);
await Promise.all([login(C.p,'test-pass-123'),login(D.p,'test-pass-123')]);
for(const X of [C,D]){if(await X.p.isVisible('#pickMe'))await X.p.click('#pickBtns [data-me="0"]');}
await Promise.all([waitSynced(C.p),waitSynced(D.p)]);await pull(C.p);await pull(D.p);
const hc=await C.p.$eval('.top h1',e=>e.textContent);
await C.p.click('.nav-btn[data-tab="tx"]');const sal=await C.p.$$eval('.tx',e=>e.filter(x=>x.textContent.includes('نزلت من الاحتياطي')).length);
const closes=await C.p.$$eval('.tx',e=>e.filter(x=>x.textContent.includes('إقفال')).length);
ok(sal===2&&closes===1,`month rollover done once even with two phones (share entries ${sal}, closes ${closes}, header ${hc})`);
const [hc2,rc2]=await envRes(C.p),[hd2,rd2]=await envRes(D.p);ok(rc2===rd2,`both new-month phones agree (C ${rc2}, D ${rd2})`);

for(const X of [A,B,C,D])if(X.p.errs.length)console.log('page errors',X.p.errs);
await b.close();})();
