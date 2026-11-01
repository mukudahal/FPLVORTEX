"""Validated inputs for the bounded FPL transfer/optional scoring-chip MILP."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Position = Literal['GK', 'DEF', 'MID', 'FWD']
QUOTAS = {'GK': 2, 'DEF': 5, 'MID': 5, 'FWD': 3}

class Player(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    player_id: int = Field(gt=0)
    name: str = Field(min_length=1)
    team_id: int = Field(gt=0)
    position: Position
    current_price: float = Field(gt=0, le=30)
    selling_price: float | None = Field(default=None, gt=0, le=30)
    xpts_by_gw: dict[int, float]
    xmin_by_gw: dict[int, float | None]
    availability_by_gw: dict[int, float | None]
    has_fixture_by_gw: dict[int, bool]

    @model_validator(mode='after')
    def check_values(self):
        if any(v is not None and not 0 <= v <= 1 for v in self.availability_by_gw.values()):
            raise ValueError('Availability must be between 0 and 1.')
        if any(v is not None and not 0 <= v <= 180 for v in self.xmin_by_gw.values()):
            raise ValueError('Projected minutes must be between 0 and 180.')
        if self.selling_price is not None and self.selling_price > self.current_price:
            raise ValueError('Selling price cannot exceed current price.')
        if round(self.current_price * 10, 6) % 1 or (self.selling_price is not None and round(self.selling_price * 10, 6) % 1):
            raise ValueError('Prices must use £0.1m increments.')
        return self

class CurrentTeam(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    squad_player_ids: list[int] = Field(min_length=15, max_length=15)
    bank: float = Field(ge=0, le=100)
    free_transfers: int = Field(ge=0, le=5)
    current_gameweek: int = Field(ge=1, le=38)

class ForcedTransfer(BaseModel):
    model_config = ConfigDict(extra='forbid')
    gw: int
    player_out: int
    player_in: int

class SolverSettings(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    start_gw: int = Field(ge=1, le=38)
    end_gw: int = Field(ge=1, le=38)
    transfer_depth: int = Field(default=10, ge=0, le=10)
    max_transfers_per_gw: int = Field(default=2, ge=0, le=15)
    max_total_hits: int | None = Field(default=0, ge=0, le=600, multiple_of=4)
    time_decay: float = Field(default=.85, ge=.5, le=1)
    free_transfer_value: float = Field(default=1.75, ge=0, le=10)
    bank_value_per_million: float = Field(default=.10, ge=0, le=10)
    solutions_requested: int = Field(default=1, ge=1, le=3)
    time_limit_seconds: int = Field(default=30, ge=1, le=300)
    mip_gap: float = Field(default=.01, ge=0, le=.5)
    locked_players: list[int] = Field(default_factory=list)
    excluded_players: list[int] = Field(default_factory=list)
    forced_transfers: list[ForcedTransfer] = Field(default_factory=list)
    allow_blank_starters: bool = True
    # Explicit, verified chip inventory. Each value lists the eligible
    # season half (1 = GW1-19, 2 = GW20-38). No chip is assumed available.
    # Wildcard/Free Hit are NOT yet supported in the joint MILP.
    scoring_chip_halves: dict[
        Literal['bench_boost', 'triple_captain'], list[Literal[1, 2]]
    ] = Field(default_factory=dict)
    # Explicit unused WC/FH inventory from verified account-specific history,
    # not an assumption inferred from current gameweek or general FPL rules.
    squad_chip_halves: dict[
        Literal['wildcard', 'free_hit'], list[Literal[1, 2]]
    ] = Field(default_factory=dict)
    # Optional manager-committed chip uses. Only validated entitlements
    # can be forced; never override a separately saved manual plan.
    forced_chip_uses: dict[int, Literal[
        'wildcard', 'free_hit', 'bench_boost', 'triple_captain'
    ]] = Field(default_factory=dict)
    # Needed at GW20: the second-half FH is NOT eligible immediately
    # after a first-half FH in GW19. None means this history is unknown.
    first_half_fh_used_gw19: bool | None = None

    @model_validator(mode='after')
    def validate_chip_inventory(self):
        for inventory in (self.scoring_chip_halves, self.squad_chip_halves):
            if any(len(halves) != len(set(halves)) for halves in inventory.values()):
                raise ValueError('Duplicate available chip in the same season half.')
        return self

class SolveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    players: list[Player] = Field(min_length=15, max_length=1000)
    current_team: CurrentTeam
    settings: SolverSettings

    @model_validator(mode='after')
    def validate_problem(self):
        s, team = self.settings, self.current_team
        if round(team.bank * 10, 6) % 1:
            raise ValueError('Bank must use £0.1m increments.')
        if s.start_gw != team.current_gameweek:
            raise ValueError('Start GW must equal the supplied current team gameweek; a later start needs its own team state.')
        if s.end_gw < s.start_gw or s.end_gw - s.start_gw >= 10:
            raise ValueError('Choose a horizon of 1 to 10 consecutive gameweeks.')
        ids = [p.player_id for p in self.players]
        if len(set(ids)) != len(ids) or len(set(team.squad_player_ids)) != 15:
            raise ValueError('Player IDs and current squad IDs must be unique.')
        by_id = {p.player_id: p for p in self.players}
        if not set(team.squad_player_ids) <= by_id.keys():
            raise ValueError('All current squad players must be in the player list.')
        squad = [by_id[i] for i in team.squad_player_ids]
        # Original owned players need their actual selling price, which may
        # be below current market price due to FPL's half-profit rule.
        # Never silently substitute market value for a missing sale basis.
        if any(p.selling_price is None for p in squad):
            raise ValueError('Each original squad player requires a verified selling price.')
        if any(sum(p.position == pos for p in squad) != n for pos, n in QUOTAS.items()):
            raise ValueError('Current squad must contain 2 GK, 5 DEF, 5 MID and 3 FWD.')
        if any(sum(p.team_id == t for p in squad) > 3 for t in {p.team_id for p in squad}):
            raise ValueError('Current squad cannot contain more than three players from one club.')
        known = set(ids)
        if not set(s.locked_players) <= set(team.squad_player_ids):
            raise ValueError('Locked players must be in the current squad.')
        if not set(s.excluded_players) <= known or set(s.locked_players) & set(s.excluded_players):
            raise ValueError('Excluded players must exist and cannot also be locked.')
        for tr in s.forced_transfers:
            if tr.gw not in range(s.start_gw, s.end_gw + 1) or tr.player_in not in known or tr.player_out not in known or tr.player_in == tr.player_out:
                raise ValueError('Invalid forced transfer.')
        available = {**s.scoring_chip_halves, **s.squad_chip_halves}
        forced_by_half = set()
        for gw, chip in s.forced_chip_uses.items():
            half = 1 if gw <= 19 else 2
            if gw < s.start_gw or gw > s.end_gw or half not in available.get(chip, []):
                raise ValueError(f'Forced chip {chip} in GW{gw} is not verified available in this horizon.')
            if gw == 1 and chip in ('wildcard', 'free_hit'):
                raise ValueError('Wildcard/Free Hit unavailable in GW1.')
            if (chip, half) in forced_by_half:
                raise ValueError('Duplicate forced chip within same season half.')
            forced_by_half.add((chip, half))
            if chip == 'free_hit' and s.forced_chip_uses.get(gw - 1) == 'free_hit':
                raise ValueError('Free Hits cannot be consecutive gameweeks.')
            if chip == 'free_hit' and gw == 20 and s.first_half_fh_used_gw19 is not False:
                raise ValueError('GW20 Free Hit requires verified evidence GW19 did not use Free Hit.')
        for p in self.players:
            for gw in range(s.start_gw, s.end_gw + 1):
                if any(gw not in d for d in (p.xpts_by_gw, p.xmin_by_gw, p.availability_by_gw, p.has_fixture_by_gw)):
                    raise ValueError(f'Missing GW{gw} inputs for player {p.player_id}.')
                if not p.has_fixture_by_gw[gw] and (p.xpts_by_gw[gw] != 0 or p.xmin_by_gw[gw] not in (0, None)):
                    raise ValueError(f'Blank GW{gw} must have zero xPts and xMins for player {p.player_id}.')
        return self
