# Market & Fitness components

The user references informed density and information order. This implementation keeps Vortex navy and brass and uses the existing licensed player-image resolver; no reference-site assets or code were copied.

- Desktop: compact sortable price table alongside a fitness column. At 1150px the fitness blocks move below; at 639px they stack. Only the table scrolls horizontally on mobile, with player identity pinned.
- Table headings: actual buttons, aria-sort, 40px target, keyboard focus, ascending/descending state. Missing numeric data sorts last in both directions.
- Scope: My team / All, search, position, club, 20-row paging. Forecasts and confirmed GW changes are distinct views.
- Player identity: 37x47 image on a pale background, 14px name, club/position/current price below. Forecast status is a threshold description, never a probability.
- Fitness: pale compact cards with 44x58 photos, readable names, explicit status and supplied availability. Expand to see timestamp and card totals. Filters: All / My team / New plus text search. Empty states preserve filters.
- Booking watch: club match counts from finished fixtures determine active thresholds; suspended players remain in the availability feed. Existing visit marker is retained.
- Feed: Analysis Live scoring rows now have a bright photo tile with a small event marker.
- Refresh failure: retain last good bootstrap payload and show a retry action. Five-minute polling and manual refresh share the same source.

CSS roles and responsive implementation live in src/app/globals.css. Color pairs are checked by the Replica design contrast tool. No additional font download is required.
