# Recon map: FPL Core Team Planner (web)

Scope: the Team Planner screen only (player pool + pitch + gameweek timeline).
For: the user's own FPL Vortex app (Next.js), rebuilt clean-room.
Date: 2026-10-18

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | public page | https://www.fplcore.com/transfer-planner/draft | renders with JavaScript; only the site menu and meta description were readable |
| 2 | user's screenshot | replica/screens/S01-transfer-planner.png | the only source for layout and states; used for hierarchy, not pixels |
| 3 | page meta description | (same URL) | "Plan your FPL transfers, chips and captaincy across multiple gameweeks. Import your current squad, then save your strategy." |

No source code, network calls or private APIs were read.

## Core loop

Pick a player on the pitch, choose a replacement from a filterable, sortable pool, and step through gameweeks to see free transfers, cost and bank.

## Screens

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Team Planner | /transfer-planner | plan transfers over many GWs | GW timeline, player pool table, pitch/table toggle, summary strip | filled; empty/loading/error not seen |

## Flows

```
F01 Plan a transfer
    S01 click player on pitch -> choose Remove -> pick replacement in pool
    happy path clicks: 3
    edge: over budget, 3-per-club limit, wrong position, no free transfers (hit)
F02 Browse and rank players
    S01 filter (search, ownership, price, position, team) -> click a column heading to sort
    happy path clicks: 2
```

## Components (from the screenshot)

| component | variants | states | used on |
| --- | --- | --- | --- |
| GW timeline card | selected / default, shows "N FT" | hover, selected | S01 |
| Search + Reset | | empty, filled | S01 |
| Dual sliders | max ownership, max price | | S01 |
| Segmented position filter | All GK DEF MID FWD | selected | S01 |
| Teams / Columns buttons | popovers | | S01 |
| Sortable table heading | with up/down chevron | active asc / desc | S01 |
| Player row | info icon, photo, name, team and position, fixture chips, price (with rise arrow), ownership, points | hover, in squad | S01 |
| Pager | "667 players, Page 1 of 14" | | S01 |
| Pitch card | photo, name, fixture label, C / V badge | selected, new, flagged | S01 |
| Summary strip | Transfers, Transfer cost, Bank | | S01 |
| Tip banner | dismissible | | S01 |

## Inferred data model

Player(id, name, team, position, price, ownership, total points, form, status, fixtures[]); Squad(gw, players[15], captain, vice, bank); Transfer(gw, out, in); FreeTransfers(gw). Confidence: medium, inferred from the screenshot.

## What cannot be cloned

Their player photos, club badges, logo and brand colours; their data pipeline. The clone uses the app's own assets and the official FPL data.

## Size

S for this one screen. The hard part is the planning engine (transfer validation, hits, price tracking), which already exists in the Vortex app.
