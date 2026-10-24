"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import type { Fixture, SlimElement, SlimTeam } from "@/lib/types";

const SEEN_KEY = "fpl-news-last-seen";
const THRESHOLDS = [{ cards: 5, games: 19 }, { cards: 10, games: 32 }, { cards: 15, games: 38 }];
const RULES_URL = "https://www.premierleague.com/en/news/1938772";
function statusLabel(e: SlimElement) {
  return e.status === "s" ? "Suspended" : e.status === "d" ? "Doubtful" : e.status === "i" ? "Injured" : e.status === "u" || e.status === "n" ? "Unavailable" : "Update";
}
export function NewsView({ elements, teamsMap, squadIds, fixtures }: {
  elements: SlimElement[]; teamsMap: Map<number, SlimTeam>; squadIds: number[]; fixtures: Fixture[] | null;
}) {
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const squad = useMemo(() => new Set(squadIds), [squadIds]);
  useEffect(() => {
    // Restore browser-only visit state after hydration.
    const restore = setTimeout(() => { try { setLastSeen(localStorage.getItem(SEEN_KEY)); } catch {} }, 0);
    const t = setTimeout(() => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch {} }, 4000);
    return () => { clearTimeout(restore); clearTimeout(t); };
  }, []);
  const gamesPlayed = useMemo(() => {
    const counts = new Map<number, number>();
    for (const f of fixtures ?? []) if (f.finished || f.finished_provisional) {
      counts.set(f.team_h, (counts.get(f.team_h) ?? 0) + 1);
      counts.set(f.team_a, (counts.get(f.team_a) ?? 0) + 1);
    }
    return counts;
  }, [fixtures]);
  const watch = useMemo(() => fixtures ? elements.flatMap(e => {
    const played = gamesPlayed.get(e.team) ?? 0;
    const threshold = THRESHOLDS.find(t => played < t.games);
    return threshold && e.yellow_cards === threshold.cards - 1 && e.status !== "s" ? [{ e, threshold }] : [];
  }).sort((a, b) => Number(squad.has(b.e.id)) - Number(squad.has(a.e.id)) || b.e.yellow_cards - a.e.yellow_cards || a.e.web_name.localeCompare(b.e.web_name)) : [], [elements, fixtures, gamesPlayed, squad]);
  const news = useMemo(() => elements.filter(e => e.element_type <= 4 && (e.news || ["i", "s", "d", "u", "n"].includes(e.status)) &&
    (scope !== "squad" || squad.has(e.id)) && (scope !== "new" || !lastSeen || (e.news_added ?? "") > lastSeen) &&
    `${e.web_name} ${e.news}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
    .sort((a, b) => Number(squad.has(b.id)) - Number(squad.has(a.id)) || (b.news_added ?? "").localeCompare(a.news_added ?? "") || a.web_name.localeCompare(b.web_name)), [elements, scope, squad, lastSeen, query]);
  return <aside className="market-fitness-column">
    <section className="market-panel" aria-labelledby="market-yellow-title"><header className="market-panel-head"><div><span className="market-kicker">02 / Discipline</span><h2 id="market-yellow-title">Booking watch</h2></div><span className="market-count">{fixtures ? watch.length : "…"} at risk</span></header>
      <div className="market-bookings">{watch.map(({ e, threshold }) => <div className={`market-booking ${squad.has(e.id) ? "is-mine" : ""}`} key={e.id}><span className="market-photo"><PlayerPhoto code={e.code} alt={e.web_name}/></span><span><strong>{e.web_name}</strong><small>{teamsMap.get(e.team)?.short_name}{squad.has(e.id) ? " · Your team" : ""}</small></span><span className="market-yellow-count">{e.yellow_cards}/{threshold.cards}<small>1 from ban</small></span></div>)}{!watch.length ? <p className="market-note">{fixtures ? "No players one booking from the next threshold." : "Loading club match counts…"}</p> : null}</div>
      <p className="market-note">Based on each club’s completed league matches. <a href={RULES_URL} target="_blank" rel="noreferrer">Suspension rules ↗</a></p>
    </section>
    <section className="market-panel" aria-labelledby="market-news-title"><header className="market-panel-head"><div><span className="market-kicker">03 / Availability</span><h2 id="market-news-title">Injuries &amp; bans</h2></div><span className="market-count">{news.length}</span></header>
      <div className="market-news-filters"><input aria-label="Search injury updates" placeholder="Find a player or update…" value={query} onChange={e => setQuery(e.target.value)}/><div className="market-segment">{[["all", "All"], ["squad", "My team"], ["new", "New"]].map(([id, label]) => <button key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</button>)}</div></div>
      <div className="market-news-list">{news.map(e => <details key={e.id} className={`market-news-row ${squad.has(e.id) ? "is-mine" : ""}`}><summary><span className="market-photo"><PlayerPhoto code={e.code} alt={e.web_name}/></span><span className="market-news-copy"><span className="market-news-name"><strong>{e.web_name}</strong><small>{teamsMap.get(e.team)?.short_name}{squad.has(e.id) ? " · Yours" : ""}</small></span><span className={`market-health-badge ${e.status === "d" ? "doubt" : e.status === "a" ? "available" : "out"}`}>{statusLabel(e)}{e.chance_of_playing_next_round != null ? ` · ${e.chance_of_playing_next_round}%` : ""}</span><span className="market-news-text">{e.news || "No further update supplied by FPL."}</span></span><span className="market-expand" aria-hidden="true">⌄</span></summary><div className="market-news-detail">{e.news_added ? <time dateTime={e.news_added}>FPL updated {new Date(e.news_added).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time> : "Update time not supplied."}<p>Next-round availability: {e.chance_of_playing_next_round === null ? "FPL has not supplied a percentage." : `${e.chance_of_playing_next_round}% according to FPL.`} Yellow cards: {e.yellow_cards} · Red cards: {e.red_cards}.</p></div></details>)}{!news.length ? <p className="market-note">No updates match your filters.</p> : null}</div>
    </section>
  </aside>;
}
