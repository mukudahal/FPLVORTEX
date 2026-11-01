"""Independent exact-accounting replay for proposed FPL chip/transfer schedules.

This is a Python MATHEMATICAL VALIDATOR, not the production chip scheduler.
Its purpose is to fail closed on bad WC/FH transitions before a future
joint all-chip MILP is permitted to generate user-facing proposals.
No external API, paid provider, or saved plan is touched.
"""
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass
from math import isfinite
from typing import Literal
from .models import SolveRequest, QUOTAS

Chip = Literal['wildcard', 'free_hit', 'bench_boost', 'triple_captain']
ALL_CHIPS = frozenset(('wildcard', 'free_hit', 'bench_boost', 'triple_captain'))


@dataclass(frozen=True)
class WeekAction:
    gw: int
    # Normal/WC transfer moves are permanent. For Free Hit use temporary_squad.
    transfers: tuple[tuple[int, int], ...] = ()
    temporary_squad: tuple[int, ...] = ()
    chip: Chip | None = None
    starters: tuple[int, ...] = ()
    captain: int = 0
    vice: int = 0


def validate_proposed_chip_path(
    request: SolveRequest,
    actions: list[WeekAction],
    *,
    verified_available: dict[str, set[int]],
) -> list[dict]:
    """Validate and score one full horizon with official FPL state semantics.

    `verified_available` must originate from VERIFIED manager chip history;
    absence means NO entitlement. A proposal never plays a chip automatically.
    Use the same fixed-price source as the verified no-chip MILP.
    """
    gw_range = list(range(request.settings.start_gw, request.settings.end_gw + 1))
    if [action.gw for action in actions] != gw_range:
        raise ValueError('Chip replay requires exactly one action for each consecutive horizon GW.')
    if not isinstance(verified_available, dict) or any(
        chip not in ALL_CHIPS or any(half not in (1, 2) for half in halves)
        for chip, halves in verified_available.items()
    ):
        raise ValueError('Unknown or invalid verified chip inventory.')
    pmap = {p.player_id: p for p in request.players}
    original = set(request.current_team.squad_player_ids)
    squad = set(original)
    bank = round(request.current_team.bank * 10)
    ft = request.current_team.free_transfers
    first_sale_done: set[int] = set()
    used: set[tuple[str, int]] = set()
    previous_chip: str | None = None
    ledger: list[dict] = []

    def price_tenths(pid: int) -> int:
        if pid not in pmap:
            raise ValueError('Unknown player in chip path.')
        return round(pmap[pid].current_price * 10)

    def sale_tenths(pid: int) -> int:
        p = pmap[pid]
        return round(p.selling_price * 10) if pid in original and pid not in first_sale_done else price_tenths(pid)

    def legal_squad(owners: set[int]) -> None:
        if len(owners) != 15 or any(pid not in pmap for pid in owners):
            raise ValueError('Every active FPL squad must have 15 verified players.')
        if Counter(pmap[pid].position for pid in owners) != Counter(QUOTAS):
            raise ValueError('Invalid squad position quota.')
        if max(Counter(pmap[pid].team_id for pid in owners).values()) > 3:
            raise ValueError('Squad exceeds three players per club.')
        if not set(request.settings.locked_players) <= owners:
            raise ValueError('A locked player cannot be discarded.')
        if owners & set(request.settings.excluded_players):
            raise ValueError('Excluded player in active squad.')

    legal_squad(squad)
    for action in actions:
        gw = action.gw
        half = 1 if gw <= 19 else 2
        chip = action.chip
        if chip is not None:
            if chip not in ALL_CHIPS or half not in verified_available.get(chip, set()):
                raise ValueError(f'Unverified or unavailable {chip} in GW{gw}.')
            if (chip, half) in used:
                raise ValueError(f'Chip {chip} already used in this season half.')
            if gw == 1 and chip in ('wildcard', 'free_hit'):
                raise ValueError('WC and FH cannot be used in GW1.')
            if chip == 'free_hit' and previous_chip == 'free_hit':
                raise ValueError('Free Hit cannot be played in consecutive Gameweeks.')
            used.add((chip, half))
        if chip != 'free_hit' and action.temporary_squad:
            raise ValueError('Temporary squad is only legal on Free Hit.')
        if chip == 'free_hit' and action.transfers:
            raise ValueError('Use a temporary squad, not permanent transfers, on Free Hit.')

        before = set(squad)
        temporary_bank: int | None = None
        sells: list[dict] = []
        buys: list[dict] = []
        if chip == 'free_hit':
            if len(action.temporary_squad) != 15 or len(set(action.temporary_squad)) != 15:
                raise ValueError('Free Hit requires a complete unique temporary 15.')
            active = set(action.temporary_squad)
            legal_squad(active)
            for pid in sorted(before - active):
                sells.append({'id': pid, 'price_tenths': sale_tenths(pid)})
            for pid in sorted(active - before):
                buys.append({'id': pid, 'price_tenths': price_tenths(pid)})
            temporary_bank = bank + sum(item['price_tenths'] for item in sells) - sum(item['price_tenths'] for item in buys)
            if temporary_bank < 0:
                raise ValueError('Free Hit temporary squad exceeds actual sale-value budget.')
            # FH is one-week only: permanent squad, selling basis and bank
            # are NOT updated. The banked FT count is preserved.
            n = len(buys)
            hit, next_ft, next_bank = 0, ft, bank
        else:
            pairs = list(action.transfers)
            outs = [out for out, _ in pairs]
            ins = [incoming for _, incoming in pairs]
            if (len(outs) != len(set(outs)) or len(ins) != len(set(ins))
                or any(pid not in before for pid in outs)
                or any(pid in before or pid not in pmap for pid in ins)):
                raise ValueError('Illegal duplicate, unowned sale, or already-owned purchase.')
            if len(pairs) > request.settings.max_transfers_per_gw and chip != 'wildcard':
                raise ValueError('Transfer count exceeds bounded non-WC optimizer setting.')
            active = (before - set(outs)) | set(ins)
            legal_squad(active)
            for pid in outs:
                sells.append({'id': pid, 'price_tenths': sale_tenths(pid)})
            for pid in ins:
                buys.append({'id': pid, 'price_tenths': price_tenths(pid)})
            next_bank = bank + sum(item['price_tenths'] for item in sells) - sum(item['price_tenths'] for item in buys)
            if next_bank < 0:
                raise ValueError('Transfer plan has negative bank using actual sale values.')
            for pid in outs:
                if pid in original:
                    first_sale_done.add(pid)
            n = len(pairs)
            if chip == 'wildcard':
                next_ft, hit = ft, 0
            else:
                hit = 4 * max(0, n - ft)
                next_ft = min(5, max(0, ft - n) + 1)
            squad = set(active)
            bank = next_bank

        starters = list(action.starters)
        if len(starters) != 11 or len(set(starters)) != 11 or not set(starters) <= active:
            raise ValueError('Invalid or incomplete XI.')
        formation = Counter(pmap[pid].position for pid in starters)
        if not (formation['GK'] == 1 and 3 <= formation['DEF'] <= 5
                and 2 <= formation['MID'] <= 5 and 1 <= formation['FWD'] <= 3):
            raise ValueError('Invalid XI formation.')
        if action.captain == action.vice or action.captain not in starters or action.vice not in starters:
            raise ValueError('Captain and vice-captain must be distinct XI players.')
        def xp(pid: int) -> float:
            value = pmap[pid].xpts_by_gw[gw]
            if not isfinite(value):
                raise ValueError('Nonfinite forecast invalidates the chip plan.')
            return value
        bench = sorted(active - set(starters))
        xi = sum(xp(pid) for pid in starters)
        cap = xp(action.captain)
        bonus = sum(xp(pid) for pid in bench) if chip == 'bench_boost' else cap if chip == 'triple_captain' else 0
        points = xi + cap + bonus - hit
        ledger.append({
            'gw': gw, 'chip': chip, 'squad': sorted(active),
            'permanent_squad_after': sorted(squad),
            'starters': starters, 'bench': bench,
            'captain': action.captain, 'vice_captain': action.vice,
            'sales': sells, 'purchases': buys,
            'transfers': n, 'free_transfers_before': ft,
            'free_transfers_after': next_ft, 'hit_cost': hit,
            'temporary_bank_tenths': temporary_bank,
            'bank_after_tenths': next_bank,
            'chip_bonus': round(bonus, 3),
            'expected_points_after_hits': round(points, 3),
        })
        ft = next_ft
        # FH squad and bank never persist; WC rebuild does persist.
        previous_chip = chip
    return ledger
