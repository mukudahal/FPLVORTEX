import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/fpl";

export const dynamic = "force-dynamic";

/**
 * Phase 5B: press conference / team-news summaries.
 * - Pulls headlines from a configurable RSS source list (env PRESS_FEEDS,
 *   comma-separated) filtered to the two club names.
 * - If an LLM key is configured (ANTHROPIC_API_KEY), summarises into
 *   injuries / returns / rotation hints / tactical notes. No long quotes.
 * - Cached for 30 minutes per fixture.
 */

const DEFAULT_FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.skysports.com/rss/12040",
];

interface FeedItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  source: string;
}

export interface PressResponse {
  found: boolean;
  items: FeedItem[];
  summary: {
    injuries: string;
    returns: string;
    rotation: string;
    tactics: string;
  } | null;
  llmUsed: boolean;
}

function parseRss(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.split(/<item[\s>]/).slice(1);
  for (const block of blocks.slice(0, 50)) {
    const pick = (tag: string) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"),
      );
      return m ? m[1].trim() : "";
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      title,
      link: pick("link"),
      pubDate: pick("pubDate") || null,
      description: pick("description").replace(/<[^>]+>/g, "").slice(0, 300),
      source,
    });
  }
  return items;
}

async function summariseWithLlm(
  items: FeedItem[],
  home: string,
  away: string,
): Promise<PressResponse["summary"]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const content = items
      .map((i) => `- ${i.title}: ${i.description}`)
      .join("\n")
      .slice(0, 6000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `You summarise pre-match team news for the fixture ${home} vs ${away}. From these headlines/snippets, output strict JSON with keys "injuries","returns","rotation","tactics" (each a short 1-2 sentence string, or "Nothing reported."). Do not quote sources verbatim.\n\n${content}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      injuries: String(parsed.injuries ?? "Nothing reported."),
      returns: String(parsed.returns ?? "Nothing reported."),
      rotation: String(parsed.rotation ?? "Nothing reported."),
      tactics: String(parsed.tactics ?? "Nothing reported."),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = (url.searchParams.get("home") ?? "").slice(0, 40);
  const away = (url.searchParams.get("away") ?? "").slice(0, 40);
  if (!home || !away) {
    return NextResponse.json({ error: "home and away required" }, { status: 400 });
  }

  const cacheKey = `press:${home}:${away}`;
  const cached = await cacheGet<PressResponse>(cacheKey, 1800);
  if (cached) return NextResponse.json(cached);

  const feeds = (process.env.PRESS_FEEDS ?? "").split(",").filter(Boolean);
  const sources = feeds.length > 0 ? feeds : DEFAULT_FEEDS;

  const allItems: FeedItem[] = [];
  for (const feed of sources.slice(0, 4)) {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "FPL-Vortex/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const host = new URL(feed).hostname.replace("www.", "").replace("feeds.", "");
      allItems.push(...parseRss(xml, host));
    } catch {
      // skip broken feed
    }
  }

  // keyword match on club names (first word handles "Man City" vs "Manchester City")
  const keys = [home, away]
    .flatMap((n) => [n, n.split(" ")[0]])
    .map((k) => k.toLowerCase())
    .filter((k) => k.length > 3);
  const matched = allItems.filter((i) => {
    const hay = `${i.title} ${i.description}`.toLowerCase();
    return keys.some((k) => hay.includes(k));
  });

  const summary =
    matched.length > 0 ? await summariseWithLlm(matched, home, away) : null;

  const body: PressResponse = {
    found: matched.length > 0,
    items: matched.slice(0, 6),
    summary,
    llmUsed: summary !== null,
  };
  await cacheSet(cacheKey, body);
  return NextResponse.json(body);
}
