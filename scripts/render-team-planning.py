"""Render the canonical JSON export. Optional research tool: Python 3 + Pillow.
Usage: python scripts/render-team-planning.py REPORT.json OUTPUT.png
Badges are downloaded from the existing production proxy; failure is explicit.
"""
import sys, json, math, io, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

report_path, output = sys.argv[1:3]
r = json.load(open(report_path))
if len(r['rows']) != 20 or r['source'] != 'vortex' or len(r['events']) > 5:
    raise ValueError('Expected all 20 VORTEX teams')
N=len(r['events'])
S=2; W,H=1920,1080
im=Image.new('RGB',(W*S,H*S)); d=ImageDraw.Draw(im)
for y in range(H*S):
    v=y/(H*S); d.line((0,y,W*S,y),fill=(int(8+5*v),int(20+11*v),int(43+19*v)))
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def text(x,y,s,size=18,fill='#eaf3ff',weight=False):
    d.text((x*S,y*S),str(s),font=ImageFont.truetype(bold if weight else font,size*S),fill=fill)
def box(x,y,w,h,fill,outline=None,radius=8):
    d.rounded_rectangle((x*S,y*S,(x+w)*S,(y+h)*S),radius=radius*S,fill=fill,outline=outline,width=S)
def color(v):
    if v is None:return '#8794aa'
    return '#40d99c' if v<=2.85 else '#45c8ce' if v<=3.45 else '#f59e42' if v<=4.2 else '#f36c83'
def badge(t):
    url='https://fplvortex.onrender.com/api/img/badge/'+str(t['teamCode'])
    data=urllib.request.urlopen(url,timeout=25).read()
    pic=Image.open(io.BytesIO(data)).convert('RGBA')
    pic.thumbnail((37*S,37*S));return t['teamId'],pic
with ThreadPoolExecutor(max_workers=5) as pool:
    badges=dict(pool.map(badge,r['rows']))
text(42,25,'FPL VORTEX',27,'#5be1e9',True)
text(42,68,'ALL 20 TEAMS  /  THE PLANNING BOARD',41,weight=True)
text(44,123,f"GW{r['events'][0]}–{r['events'][-1]}  •  Next-gameweek predictions + {N}-gameweek fixture outlook",21,'#a9bedc')
box(1415,29,460,43,'#243451','#466988');text(1434,39,'VORTEX MODEL • NOT BOOKMAKER ODDS',17,'#8ee5ed',True)
text(1418,91,'Attack / Defence index: 1 easy → 5 hard',18,'#bacbe0')
text(1418,121,'Provisional model • accuracy unverified',18,'#e4ba74')
rows=sorted(r['rows'],key=lambda t:t['team'])
# A two-panel table retains 20 clubs at readable row heights.
for panel in range(2):
    x=40+panel*950
    box(x,170,920,713,'#102747','#25486c',12)
    text(x+16,183,'CLUB / NEXT OPPONENT',14,'#8ea9ca',True)
    for off,label in [(272,'GOALS'),(348,'CS %'),(423,'WIN %'),(506,'ATT'),(563,'DEF'),(643,f'{N}-GW GOALS'),(780,'EXP. CS')]:
        text(x+off,183,label,13,'#8ea9ca',True)
    for i,t in enumerate(rows[panel*10:panel*10+10]):
        y=214+i*66
        if i%2==0:box(x+7,y-3,906,65,'#142e50',radius=4)
        pic=badges[t['teamId']];im.paste(pic,(int((x+17)*S),int((y+4)*S)),pic)
        text(x+64,y,t['shortName'],20,weight=True)
        matches=t['gameweeks'][0]['matches']
        opponent=' / '.join(f"{f['opponent']} ({'H' if f['home'] else 'A'})" for f in matches) or 'BLANK'
        text(x+128,y+2,opponent,15,'#c0d0e6')
        goals=sum(f['goals'] for f in matches)
        cs=sum(f['cleanSheet'] for f in matches)/len(matches) if matches else None
        win=sum(f['win'] for f in matches)/len(matches) if matches else None
        text(x+278,y,f'{goals:.2f}',21,'#72e6c6',True)
        text(x+350,y,'—' if cs is None else f'{cs*100:.0f}%',21,weight=True)
        text(x+426,y,'—' if win is None else f'{win*100:.0f}%',21,weight=True)
        a=t['meanAttackIndex'];b=t['meanDefenceIndex']
        text(x+506,y,'—' if a is None else f'{a:.2f}',20,color(a),True)
        text(x+563,y,'—' if b is None else f'{b:.2f}',20,color(b),True)
        text(x+660,y,f"{t['projectedGoals']:.2f}",21,'#78d5f3',True)
        text(x+795,y,f"{t['expectedCleanSheets']:.2f}",21,'#78d5f3',True)
        for j,gw in enumerate(t['gameweeks']):
            fixtures=gw['matches'];aidx=sum(f['attackIndex'] for f in fixtures)/len(fixtures) if fixtures else None
            label='/'.join(f"{f['opponent']}{' H' if f['home'] else ' A'}" for f in fixtures) or 'BLK'
            tx=x+65+j*160
            text(tx,y+31,f"{gw['event']}  {label}",12,color(aidx))
text(44,901,'HOW TO READ THE BOARD',19,'#6dd9e4',True)
text(44,934,'GOALS / CS / WIN: next GW. ATT / DEF: mean indices across the selected run. Fixture strips use the ATT colour scale.',18,'#c5d3e6')
text(44,963,f'{N}-GW goals and expected clean sheets sum across matches. Exp. CS is a count, not a probability. Blanks exclude index means.',17,'#c5d3e6')
retrieved=datetime.fromisoformat(r['retrievedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York'))
computed=datetime.fromisoformat(r['computedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York'))
rendered=datetime.now(ZoneInfo('America/New_York'))
text(44,1001,f"Official inputs: {retrieved:%d %b %Y, %I:%M:%S %p %Z}  |  Model: {computed:%I:%M:%S %p %Z}  |  Graphic: {rendered:%I:%M:%S %p %Z}  |  Forecasts, not guaranteed returns.",15,'#8ea9ca')
text(44,1036,'FPL VORTEX  •  t.me/FPLVortexDailyBot',17,'#68d7e7',True)
text(1295,1036,'Source: official FPL inputs + production team model',15,'#8ea9ca')
im.save(output)
print(json.dumps({'output':output,'size':im.size,'teams':len(rows),'badges':len(badges)}))
