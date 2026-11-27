import type { buildFiveWeekPlan } from './export-my-team-plan';

type Plan = ReturnType<typeof buildFiveWeekPlan> & { rankGoal?: { targetRank:number; targetGw:number }; ownershipScenarios?: { playerName:string } };
const points = (value: number) => value.toFixed(2);
const money = (tenths: number) => '£'+(tenths/10).toFixed(1)+'m';
const range = (gws: readonly number[]) => 'GW'+gws[0]+(gws.length>1?'–GW'+gws.at(-1):'');
const moves = (transfers: readonly {out:{name:string}; incoming:{name:string}}[]) =>
  transfers.map(move=>move.out.name+' → '+move.incoming.name).join(', ');

export function renderMyTeamSocialCaption(plan: Plan): string {
  const first=plan.weeks[0];
  const completed=plan.completedTransfers.filter(move=>move.gw===first.gw);
  const action=first.transfers.length?'Plan '+moves(first.transfers):first.chipLabel!=='Hold'?first.chipLabel:'Roll remaining transfers';
  const market=plan.playerConsiderations;
  const targetRanked = market.players.map(p=>p.fullName).join(', ');
  const insights=targetRanked ? range(market.gameweeks)+' players to consider: '+targetRanked+
    '. '+market.weeks.length+' GW of FDR, '+market.weeks.length+' GW of model xPts and live transfer counts.' : '';
  return [
    (plan.ownershipScenarios?'Conditional public-squad preview ('+plan.ownershipScenarios.playerName+' ownership not reconciled) · ':'')+'GW'+first.gw+' XI: '+first.formation+' • '+first.captain.name+' (C) • '+first.vice.name+' (VC) • '+points(first.xPts)+' net xPts.',
    (completed.length?'Done: '+moves(completed)+'. ':'')+action+' • '+money(first.bankAfter)+' bank • '+first.ftBefore+' FT now → '+first.ftAfter+' FT next GW.',
    range(plan.horizon)+' roadmap: '+points(plan.totalXPts)+' net projected points vs '+points(plan.noTransferNoChipXPts)+' if holding.'+(plan.rankGoal?' Goal: top '+plan.rankGoal.targetRank.toLocaleString('en-GB')+' by GW'+plan.rankGoal.targetGw+' (not guaranteed).':''),
    insights,
    '#FPL #FantasyPremierLeague #GW'+first.gw+' #FPLTransfers #FPLTips #FPLCaptaincy #FPLCommunity #FPLVORTEX',
  ].filter(Boolean).join('\n')+'\n';
}
