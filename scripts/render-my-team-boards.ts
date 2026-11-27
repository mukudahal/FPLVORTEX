import { considerationsSize, renderPlayerConsiderations } from './render-player-considerations';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
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
const time = (v: string) => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Qatar',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' Qatar time';
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
const css = `
*{box-sizing:border-box}
body{margin:0;width:1920px;height:1080px;overflow:hidden;font:24px Arial,sans-serif;color:#202b34;background:#f4f6f8;font-variant-numeric:tabular-nums}
.frame{position:relative;width:1840px;height:990px;margin:28px 40px 0;border:1px solid #d2dde2;border-radius:24px;background:#e8edf0;overflow:hidden}
header{height:88px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#64104b;color:white}
header img{width:248px;height:70px;object-fit:contain;object-position:left}
h1{margin:0;font-size:43px;text-align:center}header .tag{width:248px;text-align:right;font-weight:bold;color:#fff3fa}
.sub{padding:14px;margin:0;text-align:center;font-size:25px;font-weight:bold;color:#344750}
.layout{display:grid;grid-template-columns:1160px 1fr;gap:20px;margin:0 24px}
.pitch{height:614px;border:2px solid #347736;border-radius:18px;background:repeating-linear-gradient(180deg,#469c3b 0 75px,#51aa44 75px 150px);position:relative;padding:13px 18px}
.lines{position:absolute;inset:15px;border:2px solid #d4f9d99c;pointer-events:none}
.lines:before{content:"";position:absolute;top:50%;width:100%;border-top:2px solid #d4f9d99c}
.lines:after{content:"";position:absolute;top:50%;left:50%;width:160px;height:160px;transform:translate(-50%,-50%);border:2px solid #d4f9d99c;border-radius:50%}
.row{position:relative;height:146px;display:flex;justify-content:center;gap:16px;align-items:center}
.player{width:210px;height:142px;background:#f9fbfa;border:1px solid #d8e4df;border-radius:12px;text-align:center;position:relative;padding:4px 7px}
.photos{height:63px;display:flex;align-items:center;justify-content:center;gap:8px}
.portrait{width:98px;height:63px;object-fit:contain}.crest{width:38px;height:38px;object-fit:contain}
.missing{color:#5b6872;font-size:14px;max-width:84px}.name{font-size:23px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini{color:#516269;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.metric{color:#007745;font-size:22px;font-weight:800}
.arm,.risk{position:absolute;top:5px;padding:3px 6px;border-radius:6px;font-size:15px;font-weight:800}
.arm{left:5px;background:#e2f8e8;color:#005d32}.risk{right:5px;background:#ffefcb;color:#6c4100}
.bench{display:flex;justify-content:center;gap:16px;padding:9px;background:#306437;border-radius:13px}
.bench .player{width:232px;height:121px}.bench .photos,.bench .portrait{height:43px}.bench .crest{height:29px}
.benchtitle{text-align:center;color:#364c46;font-size:19px;font-weight:bold;margin:6px 0}
.panel,.roadweek{background:#fff;border:1px solid #d5dfe4;border-radius:14px;padding:13px 18px;margin-bottom:10px}
.panel h2,.roadweek h2{font-size:24px;margin:0 0 6px;color:#344750}.panel p{margin:5px 0;font-size:22px;line-height:1.15}
.panel strong,.roadweek strong{color:#007745}.panel .big{font-size:38px}.note{font-size:18px!important;color:#4e626b}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px 16px;margin:0 24px}
.grid .player{display:grid;grid-template-rows:106px 34px 23px 42px 23px;align-content:center;width:100%;height:252px;padding:8px 10px}.grid .photos{height:106px}.grid .portrait{width:148px;height:106px}
.grid .crest{width:57px;height:57px}.grid .name{font-size:29px;line-height:34px}.grid .mini{font-size:19px;line-height:23px}.grid .metric{font-size:34px;line-height:42px;background:#e8f8ed;border-radius:7px}
.roadmap{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0 24px}
.roadweek{min-height:172px}.roaddetail{font-size:20px;margin:10px 0 0;color:#4e626b}
.move{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr);align-items:center;gap:4px;margin:4px 0}
.move span{display:flex;align-items:center;gap:5px;min-width:0;font-size:18px;font-weight:bold;overflow-wrap:anywhere}
.move .outgoing{color:#a22435}.move .incoming{color:#007745}.move img{width:44px;height:44px;object-fit:contain;flex:none}.move .missing{font-size:11px}
footer{text-align:center;font-size:20px;font-weight:bold;padding-top:9px;color:#64104b}
.disclosure{position:absolute;bottom:9px;left:24px;right:24px;text-align:center;font-size:15px;color:#455861;background:#e8edf0;padding:4px}
`;
function boardPage(plan:Plan,logo:string,title:string,subtitle:string,body:string,generatedAt:string) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>FPL VORTEX · '+esc(title)+'</title><style>'+css+
    '</style><body><div class="frame"><header><img src="'+esc(logo)+'" alt="FPL VORTEX logo"><h1>'+esc(title)+'</h1><div class="tag">FPL VORTEX</div></header><div class="sub">'+esc(subtitle)+'</div>'+body+
    '<div class="disclosure">Projected points · Snapshot '+esc(time(plan.snapshotAt))+' · Render '+esc(time(generatedAt))+' · '+esc(plan.provenance?.modelVersion??'model version unavailable')+'</div></div><footer>YouTube @FPLVORTEX　 |　 X @FPLVORTEXM　 |　 Telegram t.me/FPLVortexDailyBot　 |　 Instagram @fplvortex</footer></body></html>';
}
function transferFace(p:Player,art:Map<number,Art>,side:string) {
  const photo=art.get(p.id)?.photo;
  return '<span class="'+side+'">'+(photo?'<img src="'+esc(photo.uri)+'" alt="">':'<small class="missing">Photo unavailable</small>')+esc(p.name)+'</span>';
}
const transferRow=(out:Player,incoming:Player,art:Map<number,Art>) =>
  '<div class="move">'+transferFace(out,art,'outgoing')+' → '+transferFace(incoming,art,'incoming')+'</div>';
const completedFor=(plan:Plan,gw:number)=>(plan.completedTransfers??[]).filter(move=>move.gw===gw);
export function renderRoadmap(plan:Plan,art:Map<number,Art>,logo:string,generatedAt:string) {
  const cards=plan.weeks.map(w=>{
    const done=completedFor(plan,w.gw);
    return '<section class="roadweek"><h2>GW'+w.gw+' · <strong>'+num(w.xPts)+' xPts</strong></h2>'+
      (done.length?'<p class="roaddetail">Already completed</p>'+done.map(m=>transferRow(m.out,m.incoming,art)).join(''):'')+
      (w.transfers.length?'<p class="roaddetail">Suggested moves</p>'+w.transfers.map(m=>transferRow(m.out,m.incoming,art)).join(''):'<p class="roaddetail">Roll remaining allowance</p>')+
      '<p class="roaddetail">Bank '+price(w.bankAfter)+' · '+w.ftBefore+' FT this GW · '+w.ftAfter+' FT next GW</p></section>';
  }).join('');
  return boardPage(plan,logo,'Transfer roadmap · GW'+plan.weeks[0].gw+'–GW'+plan.weeks.at(-1)!.gw,num(plan.totalXPts)+' net expected points','<div class="roadmap">'+cards+'</div>',generatedAt);
}
export function renderBoard(plan: Plan,w: Week,art: Map<number,Art>,logo: string,mode:'pitch'|'analysis', generatedAt:string) {
  assertWeek(w);
  const card=(p:Player,bench=false,index?:number)=>{
    const a=art.get(p.id);
    const arm=p.id===w.captain.id?'C':p.id===w.vice.id?'VC':bench?'B'+((index??0)+1):index!==undefined?String(index+1).padStart(2,'0'):'';
    const flagged=p.status!=='a'||(p.chance!==null&&p.chance<100);
    const photo=a?.photo?'<img class="portrait" src="'+esc(a.photo.uri)+'" alt="Official portrait">':'<span class="missing">Portrait unavailable</span>';
    const badge=a?.badge?'<img class="crest" src="'+esc(a.badge.uri)+'" alt="Club badge">':'<span class="missing">Badge unavailable</span>';
    return '<article class="player" data-player="'+p.id+'">'+(arm?'<b class="arm">'+arm+'</b>':'')+(flagged?'<b class="risk">FLAG '+esc(p.chance??p.status)+'</b>':'')+
      '<div class="photos">'+photo+badge+'</div><div class="name" title="'+esc(p.name)+'">'+esc(p.name)+'</div><div class="mini">'+fixture(p)+'</div><div class="metric">'+num(p.xPts)+' xPts</div>'+(mode==='analysis'?'<div class="mini">'+price(p.priceTenths)+' · '+num(p.localExpectedMinutes,0)+' local xMin · '+num(p.ownership,1)+'% owned</div>':'')+'</article>';
  };
  const summary='<div class="panel"><h2>DECISION SUMMARY</h2><p class="big"><strong>'+num(w.xPts)+'</strong> net xPts</p><p>vs weekly hold: <strong>'+num(w.deltaVsHoldThisWeek)+'</strong></p><p>Formation: '+esc(w.formation)+' · Chip: '+esc(w.chipLabel)+'</p><p>Bank '+price(w.bankAfter)+' · FT '+w.ftBefore+' → '+w.ftAfter+' · Hits '+w.hitCost+'</p></div>';
  const done=completedFor(plan,w.gw);
  const completed=done.length?'<div class="panel"><h2>ALREADY COMPLETED</h2>'+done.map(m=>transferRow(m.out,m.incoming,art)).join('')+'</div>':'';
  const transfer='<div class="panel"><h2>TRANSFER RECOMMENDATION</h2>'+(w.transfers.length?w.transfers.slice(0,3).map(t=>'<p class="transfer">'+esc(t.out.name)+' → <strong>'+esc(t.incoming.name)+'</strong><br><span class="note">'+price(t.sellTenths)+' sale / '+price(t.buyTenths)+' buy · '+num(t.remainingHorizonPlayerGain)+' individual horizon gain</span></p>').join(''):'<p><strong>ROLL REMAINING ALLOWANCE</strong></p>')+(w.transfers.length>3?'<p class="note">Full list in plan.json / plan.md.</p>':'')+'</div>';
  const pitch='<div class="layout"><section><div class="pitch"><div class="lines"></div>'+position.map(pos=>'<div class="row">'+w.starters.filter(p=>p.position===pos).map(p=>card(p)).join('')+'</div>').join('')+'</div><div class="benchtitle">BENCH ORDER · RESERVE GK FIRST</div><div class="bench">'+w.bench.map((p,i)=>card(p,true,i)).join('')+'</div></section><aside>'+summary+completed+transfer+'<div class="panel"><h2>CAPTAINCY</h2><p>C: <strong>'+esc(w.captain.name)+'</strong> · VC: '+esc(w.vice.name)+'</p><p class="note">Check flags, effective prices and unpublished moves before deadline. Future GWs are conditional.</p></div></aside></div>';
  const board='<div class="grid">'+[...w.starters,...w.bench].map((p,i)=>card(p,i>=11,i>=11?i-11:i)).join('')+'</div>';
  return boardPage(plan,logo,mode==='pitch'?'Recommended XI':'Squad analysis',
    'GW'+w.gw+' · '+plan.season+' · Deadline '+time(w.deadline??''),mode==='pitch'?pitch:board,generatedAt);
}
export async function showBoard(page: Page, html: string, name: string) {
  await page.setContent(html);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode()));
  });
  const overflow = await page.evaluate(() => {
    const footer = document.querySelector('.disclosure')!.getBoundingClientRect();
    return [...document.querySelectorAll('.player, aside .panel, .roadweek, .consideration-card')]
      .filter(el => el.getBoundingClientRect().bottom > footer.top || el.scrollHeight > el.clientHeight + 1)
      .map(el => el.getAttribute('data-player') ?? el.querySelector('h2')?.textContent ?? el.className);
  });
  if (overflow.length) throw Error('Board overflow '+name+' ('+overflow.join(', ')+')');
}
export async function exportBoards(plan:Plan,dir:string) {
  if(!plan.weeks.length)throw Error('No plan gameweeks');
  plan.weeks.forEach(assertWeek);
  if(Date.now()>=Date.parse(plan.weeks[0].deadline??''))throw Error('Plan opening deadline expired');
  const logo='data:image/jpeg;base64,'+(await readFile('public/player-images/brand/fpl-vortex-lion.jpg')).toString('base64');
  const candidates=plan.playerConsiderations?.players.length===6?plan.playerConsiderations:undefined;
  const players=new Map([
    ...plan.weeks.flatMap(w=>[...w.finalSquad,...w.transfers.flatMap(t=>[t.out,t.incoming])]),
    ...(plan.completedTransfers??[]).flatMap(t=>[t.out,t.incoming]),
    ...(candidates?.players??[]),
  ].map(p=>[p.id,p] as const));
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
      await showBoard(page,html,name);
      if(await page.locator('[data-player]').count()!==15)throw Error('Incomplete board '+name);
      await page.screenshot({path:join(dir,name+'.png')});
      await writeFile(join(dir,name+'.html'),html);
    }
    const roadmap=renderRoadmap(plan,art,logo,generatedAt);
    await showBoard(page,roadmap,'transfer roadmap');
    await page.screenshot({path:join(dir,'FPL_VORTEX_transfer_roadmap.png')});
    await writeFile(join(dir,'FPL_VORTEX_transfer_roadmap.html'),roadmap);
    if (candidates) {
      const brand = async (part: 'logo'|'footer') => 'data:image/jpeg;base64,'+
        (await readFile('public/player-images/brand/fpl-vortex-social-'+part+'.jpg')).toString('base64');
      const [brandLogo, brandFooter] = await Promise.all([brand('logo'),brand('footer')]);
      const name='FPL_VORTEX_players_to_consider';
      const html=renderPlayerConsiderations(candidates,art,brandLogo,brandFooter);
      await page.setViewportSize(considerationsSize);
      await showBoard(page,html,name);
      if(await page.locator('.consideration-card .photo').count()!==6)throw Error('Six official portraits are required for '+name);
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
