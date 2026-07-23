import { Avatar, Style } from "@dicebear/core";
import notionists from "@dicebear/styles/notionists.json" with { type: "json" };

const notionistsStyle = new Style(notionists);

export function GET(request) {
  const requestedSeed = new URL(request.url).searchParams.get("seed") || "Guest";
  const seed = requestedSeed.trim().slice(0, 80) || "Guest";
  const svg = new Avatar(notionistsStyle, { seed }).toString();

  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
