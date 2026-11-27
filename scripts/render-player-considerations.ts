import type { PlayerConsiderations } from './player-considerations';

type Portrait = { uri: string };
type Art = { photo?: Portrait; badge?: Portrait };
const esc = (value: string | number) => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const considerationsSize = { width: 2304, height: 1728 };
const css = `
*{box-sizing:border-box}
body{margin:0;width:2304px;height:1728px;overflow:hidden;background:radial-gradient(ellipse at top right,#eaddfa,#f7f5fc 42%,#f2f3f8 75%);color:#241333;font:700 30px "DejaVu Sans",Arial,sans-serif;font-variant-numeric:tabular-nums}
header{display:flex;align-items:center;gap:32px;height:192px;padding:28px 45px;position:relative}
header:after{content:"";height:3px;left:45px;right:45px;bottom:0;position:absolute;background:linear-gradient(90deg,#6535b9,#dbc5f9)}
header img{width:234px;height:131px;object-fit:contain;border-radius:12px}
.headline{min-width:0;border-left:4px solid #8a55d4;padding-left:27px}
.kicker{display:inline-block;margin:0 0 9px;padding:7px 23px;border-radius:35px;color:#d9ffee;background:#35145a;font-size:25px;letter-spacing:2px}
h1{margin:0;font-size:70px;line-height:1.06;letter-spacing:-2px;font-weight:900}
.considerations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,633px);gap:25px;margin:24px 45px 0}
.consideration-card{overflow:hidden;border:2px solid white;border-radius:23px;background:#fff;box-shadow:0 8px 21px #32135d27}
.hero{height:218px;overflow:hidden;position:relative;display:flex;align-items:center;gap:18px;padding:20px 235px 20px 21px;background:repeating-linear-gradient(135deg,transparent 0 63px,#ffffff26 64px 105px,transparent 107px 153px),var(--shirt);color:var(--ink)}
.hero .photo{position:absolute;right:7px;top:2px;width:255px;height:275px;object-fit:contain;object-position:center top}
.hero .badge{width:88px;height:88px;object-fit:contain;flex:none;background:#fff;padding:5px;border-radius:12px;filter:drop-shadow(0 2px 4px #32135d33)}
.identity{min-width:0;border-left:2px solid currentColor;padding-left:18px;position:relative;z-index:1}
h2{margin:0 0 10px;font-size:41px;line-height:1.09;letter-spacing:-1px;overflow-wrap:break-word}
h2.long-name{font-size:31px;letter-spacing:-.5px}
.position{display:inline-block;border-radius:7px;background:#fff;color:#251739;padding:3px 12px;font-size:20px;line-height:1.2}
.facts{margin:7px 13px 0;display:grid;grid-template-columns:290px 1fr;row-gap:2px;text-align:center}
.fact-label,.fact-value{align-content:center;background:#f3f0f7;min-height:38px;padding:2px 9px;font-size:24px;line-height:1.13}
.fact-label{text-align:left;color:#45305b;background:#eae2f3;white-space:nowrap}.fact-value{font-weight:800}
.status{color:#941e3d}.status.available{color:#00613a;background:#dcf5e5}.status.doubtful{color:#7c4602;background:#fff0ce}
table{width:calc(100% - 26px);margin:11px 13px 0;border-collapse:separate;border-spacing:3px 2px;table-layout:fixed;text-align:center}
th,td{padding:4px 2px;font-size:20px;line-height:1.14}
tr th:first-child{width:103px;text-align:left;padding-left:7px}
thead th{background:#36214e;border-radius:6px;color:#fff;font-size:21px}
.fixture td,.fixture th,.points td,.points th,.ratings th{background:#f0ebf6;border-radius:5px}
.ratings td{font-size:23px}.ratings small{display:inline-block;padding:3px 7px;border-radius:5px;margin:0 1px;font-size:24px}
.fdr-1,.fdr-2{background:#d6f0da;color:#0b5e36}.fdr-3{background:#fff1c5;color:#694900}.fdr-4,.fdr-5{background:#f9dce3;color:#90243e}
.points td{color:#25104b;font-size:27px;font-weight:900}
.total{display:flex;align-items:center;justify-content:space-between;margin:10px 13px 0;background:#e9dbfb;border-radius:9px;color:#341451;padding:5px 14px;font-size:23px}
.total strong{font-size:31px}
.disclosure{position:absolute;left:45px;right:45px;bottom:128px;color:#453558;font-size:23px}
footer{position:absolute;bottom:0;left:0;width:100%;height:auto}footer img{width:100%;height:auto;display:block}
`;

export function renderPlayerConsiderations(data: PlayerConsiderations, assets: Map<number,Art>, logo: string, footer: string) {
  if(data.players.length!==6||data.weeks.length===0) throw Error('A six-player board requires six ranked players and an upcoming gameweek.');
  const first=data.gameweeks[0], last=data.gameweeks.at(-1);
  const title='Players to most consider from GW'+first+(last!==first?' – GW'+last:'');
  const cards=data.players.map(p=>{
    const art=assets.get(p.id);
    const shirt=/^#[0-9a-f]{6}$/i.test(p.shirt)?p.shirt:'#d8e4eb';
    const [r,g,b]=[1,3,5].map(offset=>parseInt(shirt.slice(offset,offset+2),16));
    const ink=(r*.299+g*.587+b*.114)>150?'#211431':'#fff';
    const cell=(className:string,rowTitle:string,value:(week:typeof p.weeks[number])=>string)=>
      '<tr class="'+className+'"><th scope="row">'+rowTitle+'</th>'+p.weeks.map(w=>'<td>'+value(w)+'</td>').join('')+'</tr>';
    const fact=(label:string,value:string,style='')=>'<span class="fact-label">'+label+'</span><strong class="fact-value '+style+'">'+esc(value)+'</strong>';
    const forecast=p.weeks.filter(w=>w.xPts!==null);
    const total=forecast.reduce((sum,w)=>sum+(w.xPts??0),0);
    return '<article class="consideration-card" data-player="'+p.id+'"><div class="hero" style="--shirt:'+shirt+';--ink:'+ink+'">'+
      (art?.badge?'<img class="badge" src="'+esc(art.badge.uri)+'" alt="'+esc(p.club)+'">':'')+
      '<div class="identity"><h2'+(p.fullName.length>23?' class="long-name"':'')+'>'+esc(p.fullName)+'</h2><span class="position">'+esc(p.position)+'</span></div>'+
      (art?.photo?'<img class="photo" src="'+esc(art.photo.uri)+'" alt="'+esc(p.fullName)+'">':'<p>Portrait unavailable</p>')+'</div>'+
      '<div class="facts">'+fact('Availability',p.availability,'status '+p.availability.toLowerCase())+
      fact('Price','£'+(p.priceTenths/10).toFixed(1)+'m')+fact('Selected by (TSB%)',p.ownership.toFixed(1)+'%')+
      fact('GW transfers in',p.transfersIn.toLocaleString('en-GB'))+'</div>'+
      '<table><thead><tr><th scope="col">GW</th>'+data.weeks.map(gw=>'<th scope="col">GW'+gw+'</th>').join('')+'</tr></thead><tbody>'+
      cell('fixture','Fixture',w=>w.fdr.map(f=>esc(f.opponent)+' ('+(f.home?'H':'A')+')').join('<br>')||'Blank')+
      cell('ratings','FDR',w=>w.fdr.map(f=>'<small class="fdr-'+f.difficulty+'">'+f.difficulty+'</small>').join('')||'—')+
      cell('points','xPts',w=>w.xPts===null?'—':w.xPts.toFixed(1))+'</tbody></table>'+
      '<div class="total"><span>'+forecast.length+' GW xPts</span><strong>'+total.toFixed(1)+'</strong></div></article>';
  }).join('');
  const timestamp = new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.snapshotAt));
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style>'+
    '<body><header><img src="'+esc(logo)+'" alt="FPL VORTEX"><div class="headline"><p class="kicker">GAMEWEEK '+first+' / FPL VORTEX</p><h1>'+esc(title)+'</h1></div></header>'+
    '<main class="considerations">'+cards+'</main><div class="disclosure">Official FPL data · '+esc(timestamp)+' UTC · FDR = difficulty (1–5) · xPts = VORTEX projection for the first '+Math.min(4,data.weeks.length)+' gameweeks</div>'+
    '<footer><img src="'+esc(footer)+'" alt="FPL VORTEX social channels"></footer></body></html>';
}
