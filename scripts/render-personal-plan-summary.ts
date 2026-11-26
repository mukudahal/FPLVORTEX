import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Report } from './export-my-team-plan';
import { assertWeek, officialPortraitUrls } from './render-my-team-boards';

type Player = Report['weeks'][number]['starters'][number];
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const pts = (n: number) => n.toFixed(2);
const money = (n: number) => '£'+(n/10).toFixed(1)+'m';

async function loadImage(urls: string[]) {
  for (const url of urls) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(6000),redirect:'error'});
      if (!response.ok || !/^image\/png(?:;|$)/i.test(response.headers.get('content-type')??'')) continue;
      const data=Buffer.from(await response.arrayBuffer());
      if (data.length>=33 && data.length<=3*1024*1024 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        return 'data:image/png;base64,'+data.toString('base64');
      }
    } catch { /* Try the next official asset. */ }
  }
}

const css=`
*{box-sizing:border-box}body{margin:0;width:1800px;background:#111022;color:#fbfaff;font-family:Arial,sans-serif;font-variant-numeric:tabular-nums}
main{padding:48px 56px 30px}header{display:flex;gap:34px;align-items:center;margin-bottom:30px}header img{width:260px;height:130px;object-fit:contain}
.kicker{letter-spacing:3px;color:#93eadc;font-size:28px;font-weight:800}h1{margin:8px 0 0;font-size:70px;line-height:1.03}
.strip,.bench,.week{background:#30224a;border-radius:22px}.strip{display:flex;justify-content:space-between;align-items:center;padding:18px 31px;font-size:32px;margin-bottom:22px;gap:24px}
.strip strong,.mint{color:#93eadc}.strip strong{font-size:44px}small{font-size:24px;color:#d3c7e7}.deadline{color:#d3c7e7;font-size:28px;margin:0 0 24px}
.pitch{position:relative;border-radius:24px;background:repeating-linear-gradient(0deg,#155849 0 130px,#1b6652 130px 260px);border:2px solid #619b84;padding:8px 30px;overflow:hidden}
.pitch:before{content:"";position:absolute;inset:22px;border:3px solid #b6e2c976;pointer-events:none}
.row,.benchrow{display:flex;justify-content:center;gap:32px;position:relative}.row{height:229px;align-items:center}
.player{width:250px;text-align:center;position:relative}.player img,.player .shirt{width:146px;height:136px;object-fit:contain;object-position:bottom;margin:0 auto;display:block}
.player .tag{background:#15122a;border-radius:13px;padding:6px 10px;min-height:74px}.player b{display:block;font-size:34px;white-space:nowrap}.player strong{color:#93eadc;font-size:34px}
.arm{position:absolute;top:9px;right:45px;padding:6px 12px;border-radius:14px;background:#93eadc;color:#111022;font-weight:800;font-size:23px}
.player .flag{font-size:19px;color:#ffdfb2;line-height:1.1}
.shirt{background:linear-gradient(110deg,#42405b,#6f5b8f,#30224a);clip-path:polygon(26% 12%,38% 3%,46% 18%,54% 18%,62% 3%,74% 12%,99% 33%,84% 56%,74% 46%,74% 97%,26% 97%,26% 46%,16% 56%,1% 33%);display:grid!important;place-items:center;color:white;font-size:20px;font-weight:800;padding-top:25px}
.bench{margin-top:18px;padding:15px 22px 20px;text-align:center}.bench h2{margin:0 0 10px;font-size:29px;color:#eee3ff}.bench img,.bench .shirt{height:104px}
.roadmap-page{width:1260px}.roadmap-page main{padding:40px}.roadmap-page .grid{grid-template-columns:1fr}.roadmap-page h1{font-size:61px}.roadmap-page .transfer b{font-size:35px}.roadmap-page .transfer small{font-size:30px}.roadmap-page .transfer img,.roadmap-page .transfer .shirt{width:116px;height:102px}.roadmap-page .move{min-height:108px}.roadmap-page .weekmeta{font-size:28px}.roadmap-page .foot{font-size:22px}
.foot{border-top:2px solid #9b6de3;background:#251840;color:#eee3ff;text-align:center;font-size:26px;padding:17px 30px;margin-top:20px}.note{color:#d3c7e7;font-size:26px;line-height:1.25;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:21px}.week{padding:22px;display:flex;flex-direction:column}.weekhead{display:flex;justify-content:space-between;align-items:center;font-size:27px;border-bottom:1px solid #79678d;padding-bottom:12px}.weekhead b{font-size:39px}.weekhead strong{color:#93eadc}
.moves{flex:1;padding:8px 0}.move{display:grid;grid-template-columns:minmax(0,1fr) 38px minmax(0,1fr);align-items:center;gap:8px;min-height:92px}.arrow{color:#93eadc;font-size:34px;text-align:center}
.transfer{display:flex;align-items:center;gap:10px}.transfer img,.transfer .shirt{width:90px;height:85px;flex-shrink:0;object-fit:contain}.transfer .shirt{display:grid}.transfer b{display:block;font-size:26px;line-height:1.12;overflow-wrap:anywhere}.transfer small{font-size:23px}
.sell b{color:#ffd1c4}.buy b{color:#a5eeb8}.roll{padding:22px 0;color:#93eadc;font-size:30px;font-weight:700}.weekmeta{border-top:1px solid #79678d;font-size:24px;padding-top:10px;color:#d3c7e7}
`;

export async function renderPersonalPlanSummary(report: Report, output: string) {
  const [opening]=report.weeks;
  if (!opening || Date.now() >= Date.parse(opening.deadline ?? '')) throw Error('An unexpired verified plan is required.');
  report.weeks.forEach(assertWeek);
  const players = new Map([...opening.starters,...opening.bench,
    ...report.weeks.flatMap(w=>w.transfers.flatMap(t=>[t.out,t.incoming]))].map(p=>[p.id,p]));
  const assets=new Map<number,string>();
  await Promise.all([...players.values()].map(async p=>{
    const portrait=await loadImage(officialPortraitUrls(p.code));
    const shirt=!portrait && p.teamCode && await loadImage(
      [`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.teamCode}${p.position==='GKP'?'_1':''}-220.png`]);
    const asset=portrait||shirt;
    if (asset) assets.set(p.id,asset);
  }));
  const picture=(p:Player)=>assets.has(p.id)
    ? `<img src="${assets.get(p.id)}" alt="">`
    : `<span class="shirt" aria-label="Club shirt fallback">${escape(p.club ?? 'FPL')}</span>`;
  const card=(p:Player)=>{
    const armband=p.id===opening.captain.id?'C':p.id===opening.vice.id?'VC':'';
    const fixture=p.fixtures.map(f=>f.opponent+' '+(f.home?'H':'A')).join(' / ')||'Blank';
    return `<div class="player">${armband?`<span class="arm">${armband}</span>`:''}${picture(p)}<div class="tag"><b>${escape(p.name)}</b><small>${escape(fixture)}</small> <strong>${pts(p.xPts)}</strong><small> xPts</small></div></div>`;
  };
  const logo='data:image/jpeg;base64,'+(await readFile('public/player-images/brand/fpl-vortex-lion.jpg')).toString('base64');
  const end=report.weeks.at(-1)!.gw;
  const range=opening.gw===end?`GW${end}`:`GW${opening.gw}–${end}`;
  const keeper=report.goalkeeperPolicy;
  const market=report.marketSignals;
  const marketText=market ? `Most bought: ${market.mostTransferredIn.slice(0,3).map(p=>escape(p.name)).join(' · ') || 'none'} · Rise watch: ${market.predictedRisers.slice(0,3).map(p=>escape(p.name)).join(' · ') || 'none'}` : '';
  const contingency=report.goalkeeperContingency;
  const fallback=contingency?.openingMoves.map(m=>escape(m.sell)+' → '+escape(m.buy)).join(' · ');
  const notes=keeper.awaitingNews
    ? `<p class="note"><b class="mint">Team news</b> · ${escape(keeper.primary.name)} is doubtful. ${contingency?`If ruled out: ${fallback||'roll remains preferred'} under the current forecast. `:''}Check the official update before locking your team.</p>`:'';
  const deadline=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kathmandu',dateStyle:'medium',timeStyle:'short',hourCycle:'h12'}).format(new Date(opening.deadline!));
  const xi=`<p class="deadline">Deadline in Nepal · ${escape(deadline)} · ${escape(opening.formation)}</p><div class="strip"><span>Projected XI <strong>${pts(opening.xPts)}</strong> xPts</span><span>${money(opening.bankAfter)} bank · ${opening.ftAfter} FT next week</span></div>
    <div class="pitch">${['GKP','DEF','MID','FWD'].map(pos=>`<div class="row">${opening.starters.filter(p=>p.position===pos).map(card).join('')}</div>`).join('')}</div>
    <section class="bench"><h2>Bench order</h2><div class="benchrow">${opening.bench.map(card).join('')}</div></section>${notes}`;
  const roadmap=`<div class="strip"><span><strong>${pts(report.totalXPts)}</strong> net xPts</span><span>${report.gainVsHold>=0?'+':''}${pts(report.gainVsHold)} vs fixed-squad hold</span></div><div class="grid">${report.weeks.map(w=>{
    const gain=w.gainVsFixedHold;
    const player=(p:Player,kind:string)=>`<div class="transfer ${kind}">${picture(p)}<div><b>${escape(p.name)}</b><small>${pts(p.xPts)} xPts</small></div></div>`;
    return `<section class="week"><div class="weekhead"><b>GW${w.gw}</b><span><strong>${pts(w.xPts)}</strong> xPts · ${gain>=0?'+':''}${pts(gain)} vs hold</span></div>
      <div class="moves">${w.transfers.length?w.transfers.map(t=>`<div class="move">${player(t.out,'sell')}<span class="arrow">→</span>${player(t.incoming,'buy')}</div>`).join(''):'<div class="roll">Roll the free transfer</div>'}</div>
      <div class="weekmeta">FT ${w.ftBefore} → ${w.ftAfter} · ${money(w.bankAfter)} bank · ${w.hitCost} hit pts · C ${escape(w.captain.name)}</div></section>`;
  }).join('')}</div>${marketText?`<p class="note">${marketText}</p>`:''}`;
  await mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1800,height:1200}});
    for (const [name,title,label,body] of [
      [`FPLVORTEX-GW${opening.gw}-Starting-XI.png`,'Starting XI & Bench',`GW${opening.gw}`,xi],
      [`FPLVORTEX-${range}-Transfer-Roadmap.png`,'Transfer Roadmap',range,roadmap],
    ]) {
      const isRoadmap=title==='Transfer Roadmap';
      await page.setViewportSize({width:isRoadmap?1260:1800,height:1200});
      await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}</style><body class="${isRoadmap?'roadmap-page':''}"><main><header><img src="${logo}" alt="FPL VORTEX"><div><div class="kicker">${label} / FPL VORTEX</div><h1>${title}</h1></div></header>${body}<p class="note">Forecasts · Reassess before each deadline</p></main><footer class="foot">YouTube @FPLVORTEX　 |　 X @FPLVORTEXM　 |　 Telegram @FPLVortexDailyBot　 |　 Instagram @fplvortex</footer></body></html>`);
      await page.evaluate(async()=>Promise.all([...document.images].map(img=>img.decode())));
      const layout=await page.evaluate(()=>({
        cards:document.querySelectorAll('.week,.player').length,
        fits:document.body.scrollWidth<=window.innerWidth,
      }));
      if (!layout.fits || layout.cards!==(isRoadmap?report.weeks.length:15)) throw Error('Incomplete graphic '+name);
      await page.screenshot({path:join(output,name),fullPage:true});
    }
  } finally { await browser.close(); }
}

if (process.argv[1]?.endsWith('render-personal-plan-summary.ts')) {
  const [input='reports/my-team/plan.json', output='reports/my-team/graphics']=process.argv.slice(2);
  renderPersonalPlanSummary(JSON.parse(await readFile(input,'utf8')),output)
    .catch(error=>{console.error(error);process.exitCode=1;});
}
