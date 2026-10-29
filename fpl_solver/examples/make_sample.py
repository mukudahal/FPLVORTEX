"""Generate synthetic example data; these are not real player forecasts."""
import json
from pathlib import Path

players = []
positions = ['GK']*4 + ['DEF']*10 + ['MID']*10 + ['FWD']*6
owned = []
for index, position in enumerate(positions):
    local_index = index - {'GK':0,'DEF':4,'MID':14,'FWD':24}[position]
    player_id = index+1
    if local_index < {'GK':2,'DEF':5,'MID':5,'FWD':3}[position]: owned.append(player_id)
    xpts = {gw: round(2.0 + (local_index % 5)*.22 + (gw-1)*.05 + (1.8 if player_id == 24 and gw >= 2 else 0), 2) for gw in range(1,6)}
    players.append({'player_id':player_id,'name':f'Example {player_id}','team_id':index%10+1,'position':position,'current_price':5.0,'selling_price':4.9 if player_id in owned else None,'xpts_by_gw':xpts,'xmin_by_gw':{gw:75 for gw in range(1,6)},'availability_by_gw':{gw:.95 for gw in range(1,6)},'has_fixture_by_gw':{gw:True for gw in range(1,6)}})
request = {'players':players,'current_team':{'squad_player_ids':owned,'bank':4.0,'free_transfers':2,'current_gameweek':1},'settings':{'start_gw':1,'end_gw':5,'max_transfers_per_gw':1,'max_total_hits':0,'solutions_requested':1,'time_limit_seconds':30}}
Path(__file__).with_name('sample_input.json').write_text(json.dumps(request, indent=2)+'\n')
