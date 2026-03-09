import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSermons, getPodcastMeta } from "../lib/r2";
import { generateRssFeed } from "../lib/rss";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sermons = await getSermons();
    const meta = await getPodcastMeta();

    if (!meta) {
      return res.status(503).json({
        error:
          "Podcast metadata not configured, ensure uploaded podcastMeta.json in the R2 bucket",
      });
    }

    const rss = generateRssFeed(sermons, meta);

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    return res.status(200).send(rss);
  } catch (error: any) {
    console.error("Feed error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
