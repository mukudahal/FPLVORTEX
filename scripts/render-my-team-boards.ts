import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { getPlayerPhotoCandidates, getClubBadgeCandidates } from '../src/lib/playerImages';
import type { buildFiveWeekPlan } from './export-my-team-plan';

type Plan = ReturnType<typeof buildFiveWeekPlan> & { provenance?: { modelVersion: string } };
type Week = Plan['weeks'][number];
type Player = Week['starters'][number];
type Asset = { uri: string; source: string };
type Art = { photo?: Asset; badge?: Asset };
const esc = (v: unknown) => String(v ?? 'N/A').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const num = (v: unknown, decimals=2) => typeof v==='number' && Number.isFinite(v) ? v.toFixed(decimals) : 'N/A';
const price = (v: number) => '£'+num(v/10,1)+'m';
const time = (v: string) => new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' ET';
const fixture = (p: Player) => p.fixtures.length ? p.fixtures.map(f=>esc(f.opponent)+' '+(f.home?'H':'A')+' · FDR '+esc(f.fdr)).join(' / ') : 'BLANK';
const position = ['GKP','DEF','MID','FWD'] as const;
const allowed = new Set(['resources.premierleague.com','premierleague-static-files.s3.amazonaws.com']);
export function officialPortraitUrls(code: unknown) {
  if (!Number.isSafeInteger(code) || Number(code)<=0) return [];
  return getPlayerPhotoCandidates(code,undefined,'lg').filter(u=>u.startsWith('https://') && allowed.has(new URL(u).hostname));
}
export function officialBadgeUrls(code: unknown) {
  if (!Number.isSafeInteger(code) || Number(code)<=0) return [];
  return getClubBadgeCandidates(code).filter(u=>u.startsWith('https://') && allowed.has(new URL(u).hostname));
}
async function fetchAsset(urls: string[]): Promise<Asset|undefined> {
  for (const url of urls) {
    try {
      const res=await fetch(url,{signal:AbortSignal.timeout(6000),redirect:'error'});
      if(!res.ok || !/^image\/png(?:;|$)/i.test(res.headers.get('content-type')??'')) continue;
      const bytes=Buffer.from(await res.arrayBuffer());
      if(bytes.length<33 || bytes.length>3*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))continue;
      return {uri:'data:image/png;base64,'+bytes.toString('base64'),source:url};
    } catch { /* Exhaust official identity-matched candidates only. */ }
  }
}
export function assertWeek(w: Week) {
  const all=[...w.starters,...w.bench];
  if(w.starters.length!==11||w.bench.length!==4||new Set(all.map(p=>p.id)).size!==15||
      w.finalSquad.length!==15||new Set(w.finalSquad.map(p=>p.id)).size!==15||
      all.some(p=>!w.finalSquad.some(q=>q.id===p.id))||w.starters.filter(p=>p.position==='GKP').length!==1||
      w.bench[0]?.position!=='GKP'||w.captain.id===w.vice.id||
      !w.starters.some(p=>p.id===w.captain.id)||!w.starters.some(p=>p.id===w.vice.id))
    throw Error('Invalid XI / bench / armbands for GW'+w.gw);
  const counts=position.map(pos=>w.starters.filter(p=>p.position===pos).length);
  if(counts[1]<3||counts[1]>5||counts[2]<2||counts[2]>5||counts[3]<1||counts[3]>3)throw Error('Illegal formation');
}
const css=`
*{box-sizing:border-box} body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Arial,sans-serif;color:#f1f7ff;background:#080e23;font-variant-numeric:tabular-nums}
.frame{position:relative;width:1840px;height:990px;margin:28px 40px 0;border:2px solid #00d5fa;background:linear-gradient(129deg,transparent 12%,#156abe99 12.2%,transparent 23%),linear-gradient(306deg,transparent 7%,#03a9ff66 7.2%,transparent 18%),radial-gradient(ellipse at 90% 15%,#164e8b,#08172e 66%);overflow:hidden}
.frame:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(130deg,transparent 0 280px,#a9e6ff14 281px 286px,transparent 288px 360px);pointer-events:none}
header{height:86px;position:relative;display:flex;align-items:center;justify-content:space-between;background:#071225e8;border-bottom:3px solid #48dfff;padding:0 28px}header img{width:260px;height:72px;object-fit:contain}h1{margin:0;font-size:42px;letter-spacing:1px;text-align:center}header .tag{font-size:22px;font-weight:bold;color:#69eaff;width:245px;text-align:right}
.sub{position:relative;margin:0 auto 14px;width:max-content;max-width:96%;padding:9px 45px;border:2px solid #12d8ee;border-top:0;background:#081b37;clip-path:polygon(3% 0,100% 0,97% 100%,0 100%);font-size:24px;font-weight:bold}
.layout{position:relative;display:grid;grid-template-columns:1160px 1fr;gap:20px;margin:0 24px}.pitch{height:620px;border:2px solid #42c6cf;background:repeating-linear-gradient(0deg,#0a6547 0 85px,#0d7350 85px 170px);position:relative;padding:16px 24px;overflow:hidden}.lines{position:absolute;inset:15px;border:2px solid #c6f4dd66;pointer-events:none}.lines:before{content:"";position:absolute;top:50%;width:100%;border-top:2px solid #c6f4dd66}.lines:after{content:"";position:absolute;top:50%;left:50%;width:160px;height:160px;transform:translate(-50%,-50%);border:2px solid #c6f4dd66;border-radius:50%}
.row{position:relative;height:145px;display:flex;justify-content:center;gap:18px;align-items:center}.player{width:208px;height:140px;background:#07152de8;border:1.5px solid #30d4f2;clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);text-align:center;position:relative;padding:5px}.photos{height:56px;position:relative;display:flex;align-items:center;justify-content:center;gap:7px}.portrait{width:82px;height:56px;object-fit:contain}.crest{width:41px;height:41px;object-fit:contain}.missing{display:inline-block;color:#9db9d6;font-size:14px;max-width:84px}.name{font-weight:800;font-size:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini{font-size:16px;color:#c5d9ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.metric{color:#10e3ff;font-size:23px;font-weight:800}.arm{position:absolute;top:6px;left:6px;background:#04d6ed;color:#07152a;padding:3px 8px;font-weight:900}.risk{position:absolute;right:5px;top:4px;color:#ffc96a;font-size:12px}.bench{display:flex;justify-content:center;gap:20px;margin-top:10px}.bench .player{height:120px;width:218px}.bench .photos{height:46px}.bench .portrait{height:46px}.bench .crest{height:35px}.benchtitle{text-align:center;color:#b5d8eb;font-size:19px;font-weight:bold;margin:5px 0 -5px}
.panel{background:#08172ce8;border:2px solid #12cde8;clip-path:polygon(0 13px,13px 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);padding:17px;margin-bottom:12px}.panel h2{color:#e5f5ff;font-size:26px;margin:0 0 12px;border-bottom:1px solid #36799d;padding-bottom:8px}.panel p{margin:6px 0;font-size:22px;line-height:1.2}.panel strong{color:#11e0ff}.panel .big{font-size:45px}.transfer{font-size:21px!important}.note{font-size:18px!important;color:#b7cce1}.grid{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:12px 16px;margin:0 24px}.grid .player{width:100%;height:252px;padding:10px}.grid .photos{height:94px}.grid .portrait{width:116px;height:94px}.grid .crest{width:58px;height:58px}.grid .name{font-size:29px}.grid .mini{font-size:19px}.grid .metric{font-size:36px;background:#0b294b;border:1px solid #3d7197;border-radius:7px;margin:6px 0;padding:5px}.grid .risk{font-size:16px}.grid .arm{font-size:18px}
footer{position:relative;text-align:center;font-size:21px;font-weight:bold;padding-top:9px;color:#e3f1ff}.disclosure{position:absolute;bottom:7px;left:24px;right:24px;text-align:center;font-size:15px;color:#d5e8fa;background:#07152deb;padding:4px}
`;
export function renderBoard(plan: Plan,w: Week,art: Map<number,Art>,logo: string,mode:'pitch'|'analysis', generatedAt:string) {
  assertWeek(w);
  const card=(p:Player,bench=false,index?:number)=>{
    const a=art.get(p.id);
    const arm=p.id===w.captain.id?'C':p.id===w.vice.id?'VC':bench?'B'+((index??0)+1):index!==undefined?String(index+1).padStart(2,'0'):'';
    const flagged=p.status!=='a'||(p.chance!==null&&p.chance<100);
    const photo=a?.photo?'<img class="portrait" src="'+esc(a.photo.uri)+'" alt="Official portrait">':'<span class="missing">Portrait unavailable</span>';
    const badge=a?.badge?'<img class="crest" src="'+esc(a.badge.uri)+'" alt="Club badge">':'<span class="missing">Badge unavailable</span>';
    return '<article class="player" data-player="'+p.id+'">'+(arm?'<b class="arm">'+arm+'</b>':'')+(flagged?'<b class="risk">FLAG '+esc(p.chance??p.status)+'</b>':'')+
      '<div class="photos">'+photo+badge+'</div><div class="name" title="'+esc(p.name)+'">'+esc(p.name)+'</div><div class="mini">'+fixture(p)+'</div><div class="metric">'+num(p.xPts)+' xPts</div><div class="mini">'+price(p.priceTenths)+' · '+num(p.localExpectedMinutes,0)+' local xMin'+(mode==='analysis'?' · '+num(p.ownership,1)+'% owned':'')+'</div></article>';
  };
  const summary='<div class="panel"><h2>DECISION SUMMARY</h2><p class="big"><strong>'+num(w.xPts)+'</strong> net xPts</p><p>vs weekly hold: <strong>'+num(w.deltaVsHoldThisWeek)+'</strong></p><p>Formation: '+esc(w.formation)+' · Chip: '+esc(w.chipLabel)+'</p><p>Bank '+price(w.bankAfter)+' · FT '+w.ftBefore+' → '+w.ftAfter+' · Hits '+w.hitCost+'</p></div>';
  const transfer='<div class="panel"><h2>TRANSFER RECOMMENDATION</h2>'+(w.transfers.length?w.transfers.slice(0,3).map(t=>'<p class="transfer">'+esc(t.out.name)+' → <strong>'+esc(t.incoming.name)+'</strong><br><span class="note">'+price(t.sellTenths)+' sale / '+price(t.buyTenths)+' buy · '+num(t.remainingHorizonPlayerGain)+' individual horizon gain</span></p>').join(''):'<p><strong>HOLD / ROLL</strong> — preserve flexibility.</p>')+(w.transfers.length>3?'<p class="note">Full list in plan.json / plan.md.</p>':'')+'</div>';
  const pitch='<div class="layout"><section><div class="pitch"><div class="lines"></div>'+position.map(pos=>'<div class="row">'+w.starters.filter(p=>p.position===pos).map(p=>card(p)).join('')+'</div>').join('')+'</div><div class="benchtitle">BENCH ORDER · RESERVE GK FIRST</div><div class="bench">'+w.bench.map((p,i)=>card(p,true,i)).join('')+'</div></section><aside>'+summary+transfer+'<div class="panel"><h2>CAPTAINCY</h2><p>C: <strong>'+esc(w.captain.name)+'</strong> · VC: '+esc(w.vice.name)+'</p><p class="note">Check flags, effective prices and unpublished moves before deadline. Future GWs are conditional.</p></div></aside></div>';
  const board='<div class="grid">'+[...w.starters,...w.bench].map((p,i)=>card(p,i>=11,i>=11?i-11:i)).join('')+'</div>';
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>FPL VORTEX GW'+w.gw+'</title><style>'+css+'</style><body><div class="frame"><header><img src="'+esc(logo)+'" alt="FPL VORTEX original logo"><h1>'+ (mode==='pitch'?'RECOMMENDED XI & TRANSFERS':'15 PLAYER ANALYSIS')+'</h1><div class="tag">FPL VORTEX<br>INTELLIGENCE</div></header><div class="sub">GW'+w.gw+' · '+esc(plan.season)+' · Deadline '+esc(time(w.deadline??''))+'</div>'+(mode==='pitch'?pitch:board)+'<div class="disclosure">Expected points and captaincy recommendations are forecasts, not guaranteed returns. · Snapshot '+esc(time(plan.snapshotAt))+' · Render '+esc(time(generatedAt))+' · '+esc(plan.provenance?.modelVersion??'model version unavailable')+'</div></div><footer>TELEGRAM t.me/FPLVortexDailyBot　 |　 YOUTUBE @FPLVORTEX　 |　 DISCORD @fplvortex　 |　 X @FPLVORTEXM</footer></body></html>';
}
export async function exportBoards(plan:Plan,dir:string) {
  if(!plan.weeks.length)throw Error('No plan gameweeks');
  plan.weeks.forEach(assertWeek);
  if(Date.now()>=Date.parse(plan.weeks[0].deadline??''))throw Error('Plan opening deadline expired');
  const logo='data:image/jpeg;base64,'+(await readFile('public/player-images/brand/fpl-vortex-lion.jpg')).toString('base64');
  const players=new Map(plan.weeks.flatMap(w=>w.finalSquad.map(p=>[p.id,p] as const)));
  const badges=new Map<number,Asset|undefined>(),art=new Map<number,Art>();
  const codes=[...new Set([...players.values()].map(p=>p.teamCode).filter((x):x is number=>x!==null))];
  for(let i=0;i<codes.length;i+=8)await Promise.all(codes.slice(i,i+8).map(async c=>badges.set(c,await fetchAsset(officialBadgeUrls(c)))));
  const entries=[...players.values()];
  for(let i=0;i<entries.length;i+=8)await Promise.all(entries.slice(i,i+8).map(async p=>{art.set(p.id,{photo:await fetchAsset(officialPortraitUrls(p.code)),badge:p.teamCode===null?undefined:badges.get(p.teamCode)});}));
  await mkdir(dir,{recursive:true});
  const generatedAt=new Date().toISOString();
  if(Date.parse(generatedAt)>=Date.parse(plan.weeks[0].deadline??''))throw Error('Plan expired during asset retrieval');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    for(const w of plan.weeks)for(const mode of ['pitch','analysis'] as const){
      const name='FPL_VORTEX_GW'+String(w.gw).padStart(2,'0')+'_'+mode;
      const html=renderBoard(plan,w,art,logo,mode,generatedAt);
      await page.setContent(html);
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
      if(await page.locator('[data-player]').count()!==15)throw Error('Incomplete board '+name);
      const fits=await page.evaluate(()=>{
        const disclosure=document.querySelector('.disclosure')!.getBoundingClientRect();
        return [...document.querySelectorAll('.player,aside .panel')].every(el=>el.getBoundingClientRect().bottom<=disclosure.top);
      });
      if(!fits)throw Error('Board overflow '+name);
      await page.screenshot({path:join(dir,name+'.png')});
      await writeFile(join(dir,name+'.html'),html);
    }
  } finally {await browser.close();}
  const manifest={generatedAt,snapshotAt:plan.snapshotAt,modelVersion:plan.provenance?.modelVersion??null,players:entries.map(p=>({id:p.id,code:p.code,teamCode:p.teamCode,photo:art.get(p.id)?.photo?.source??null,badge:art.get(p.id)?.badge?.source??null}))};
  await writeFile(join(dir,'image-provenance.json'),JSON.stringify(manifest,null,2)+'\n');
  if(manifest.players.some(p=>!p.photo||!p.badge))throw Error('One or more official images were unavailable; graphics are labeled previews, not publication-ready.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input='reports/my-team/plan.json',output='reports/my-team/graphics']=process.argv.slice(2);
  exportBoards(JSON.parse(await readFile(input,'utf8')) as Plan,output).catch(e=>{console.error(e);process.exitCode=1;});
}
