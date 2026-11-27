import type { PlayerConsiderations } from './player-considerations';

type Portrait = { uri: string };
type Art = { photo?: Portrait; badge?: Portrait };
const esc = (value: string | number) => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const considerationsSize = { width: 2100, height: 1680 };
const css = `
*{box-sizing:border-box}
body{margin:0;width:2100px;height:1680px;overflow:hidden;background:#f1f4f6;color:#132a3a;font:30px Arial,sans-serif;font-variant-numeric:tabular-nums}
header{display:flex;align-items:center;gap:36px;height:168px;padding:22px 42px;background:#fff;border-bottom:1px solid #dce6ec}
header img{width:218px;height:122px;object-fit:contain}h1{margin:0;font-size:61px;line-height:1.08;letter-spacing:-1.5px}
header p{margin:9px 0 0;font-size:28px;font-weight:bold;color:#476071}
.considerations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,638px);gap:22px;margin:22px 42px 0}
.consideration-card{overflow:hidden;border:1px solid #d5e1e8;border-radius:22px;background:#fff;box-shadow:0 4px 12px #0c2b3d12}
.hero{height:254px;overflow:hidden;position:relative;display:flex;align-items:flex-end;justify-content:center;background:linear-gradient(115deg,transparent 40%,#ffffff45),var(--shirt)}
.hero .photo{position:absolute;top:10px;width:385px;height:385px;object-fit:contain;object-position:center top}
.club{position:absolute;top:20px;left:20px;display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:10px;background:#fff;color:#132a3a;font-size:26px;font-weight:800}
.club img{width:40px;height:40px;object-fit:contain}
h2{display:flex;align-items:center;justify-content:center;text-align:center;margin:0;height:80px;padding:0 18px;font-size:40px;line-height:1.04;letter-spacing:-.6px}h2.long-name{font-size:34px;line-height:1.04}
.facts{display:grid;grid-template-columns:1.2fr .8fr 1fr;border-top:1px solid #dce6ec;border-bottom:1px solid #dce6ec;padding:9px 0;text-align:center}
.fact+.fact{border-left:1px solid #dce6ec}.label{display:block;margin-bottom:4px;color:#425b69;font-size:22px;font-weight:bold}
.fact strong{font-size:30px}.status{color:#9a2437}.status.available{color:#087548}.status.doubtful{color:#8a4d04}
table{width:calc(100% - 32px);margin:7px 16px 0;border-collapse:collapse;table-layout:fixed;text-align:center}
th,td{border-bottom:1px solid #e0e9ee;padding:5px 3px;font-size:25px;line-height:1.12}
thead th{color:#3c5666;font-size:23px}tr th:first-child{width:125px;text-align:left;padding-left:8px}
.fixture th,.fixture td{background:#eef3f7}.ratings td{font-size:28px;font-weight:800}.ratings small{display:inline-block;padding:3px 12px;border-radius:6px;margin:0 2px;font-size:27px}
.fdr-1,.fdr-2{background:#def4e1;color:#0c663a}.fdr-3{background:#e8edf1;color:#253b4c}.fdr-4,.fdr-5{background:#fbe3e4;color:#8f203d}
.points td{color:#075f55;font-size:31px;font-weight:800}.disclosure{position:absolute;left:42px;right:42px;bottom:114px;color:#425b69;font-size:23px}
footer{position:absolute;bottom:0;left:0;width:100%;height:106px}footer img{width:100%;height:auto;display:block}
`;

export function renderPlayerConsiderations(data: PlayerConsiderations, assets: Map<number,Art>, logo: string, footer: string) {
  if(data.players.length!==6||data.weeks.length===0) throw Error('A six-player board requires six ranked players and an upcoming gameweek.');
  const first=data.gameweeks[0], last=data.gameweeks.at(-1);
  const title='Players to most consider from GW'+first+(last!==first?' – GW'+last:'');
  const cards=data.players.map(p=>{
    const art=assets.get(p.id);
    const shirt=/^#[0-9a-f]{6}$/i.test(p.shirt)?p.shirt:'#d8e4eb';
    const cell=(className:string,rowTitle:string,value:(week:typeof p.weeks[number])=>string)=>
      '<tr class="'+className+'"><th scope="row">'+rowTitle+'</th>'+p.weeks.map(w=>'<td>'+value(w)+'</td>').join('')+'</tr>';
    return '<article class="consideration-card" data-player="'+p.id+'"><div class="hero" style="--shirt:'+shirt+'"><div class="club">'+
      (art?.badge?'<img src="'+esc(art.badge.uri)+'" alt="">':'')+esc(p.club)+'</div>'+
      (art?.photo?'<img class="photo" src="'+esc(art.photo.uri)+'" alt="'+esc(p.fullName)+'">':'<p>Portrait unavailable</p>')+'</div>'+
      '<h2'+(p.fullName.length>28?' class="long-name"':'')+'>'+esc(p.fullName)+'</h2><div class="facts"><div class="fact"><span class="label">Availability</span><strong class="status '+p.availability.toLowerCase()+'">'+esc(p.availability)+'</strong></div>'+
      '<div class="fact"><span class="label">Price</span><strong>£'+(p.priceTenths/10).toFixed(1)+'m</strong></div>'+
      '<div class="fact"><span class="label">Selected by (TSB%)</span><strong>'+p.ownership.toFixed(1)+'%</strong></div></div>'+
      '<table><thead><tr><th scope="col">Gameweek</th>'+data.weeks.map(gw=>'<th scope="col">GW'+gw+'</th>').join('')+'</tr></thead><tbody>'+
      cell('fixture','Fixture',w=>w.fdr.map(f=>esc(f.opponent)+' ('+(f.home?'H':'A')+')').join('<br>')||'Blank')+
      cell('ratings','FDR',w=>w.fdr.map(f=>'<small class="fdr-'+f.difficulty+'">'+f.difficulty+'</small>').join('')||'—')+
      cell('points','xPts',w=>w.xPts.toFixed(1))+'</tbody></table></article>';
  }).join('');
  const timestamp = new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.snapshotAt));
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style>'+
    '<body><header><img src="'+esc(logo)+'" alt="FPL VORTEX"><div><h1>'+esc(title)+'</h1><p>Fantasy Premier League</p></div></header>'+
    '<main class="considerations">'+cards+'</main><div class="disclosure">Official FPL data · '+esc(timestamp)+' UTC · FDR = fixture difficulty (1–5) · xPts = VORTEX model projection</div>'+
    '<footer><img src="'+esc(footer)+'" alt="FPL VORTEX social channels"></footer></body></html>';
}
