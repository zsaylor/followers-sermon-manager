import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSermons, getPodcastMeta } from "../lib/r2";
import { generateRssFeed } from "../lib/rss";
import { PodcastMeta } from "../lib/types";

const DEFAULT_META: PodcastMeta = {
  title: "Church Sermons",
  description: "Weekly sermons from our church",
  link: "https://yourchurch.com",
  language: "en",
  author: "Church Name",
  email: "pastor@yourchurch.com",
  imageUrl: "https://yourchurch.com/cover.jpg",
  category: "Religion & Spirituality",
  subcategory: "Christianity",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sermons = await getSermons();
    const meta = (await getPodcastMeta()) || DEFAULT_META;
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
