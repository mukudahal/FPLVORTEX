import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? "UCDU7nEIN72xoiR3NtxCT6CQ"; // @FPLVORTEX

export interface VideoItem {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Latest uploads of the channel, read from YouTube's public RSS feed (no API key). */
export async function GET() {
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const xml = await res.text();

    const videos: VideoItem[] = [];
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const block = m[1];
      const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const title = block.match(/<title>([^<]*)<\/title>/)?.[1];
      const published = block.match(/<published>([^<]+)<\/published>/)?.[1];
      if (!id || !title || !published) continue;
      videos.push({
        id,
        title: decode(title),
        published,
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
      });

    }
    return NextResponse.json(videos);
  } catch {
    return NextResponse.json({ error: "Could not load videos." }, { status: 502 });
  }
}
