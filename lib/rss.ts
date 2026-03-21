import { Sermon, PodcastMeta } from "../shared/types";

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRfc2822(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = days[date.getUTCDay()];
  const dateNum = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${day}, ${dateNum} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

export function generateRssFeed(sermons: Sermon[], meta: PodcastMeta): string {
  const items = sermons
    .map((sermon) => {
      const pubDate = formatRfc2822(new Date(sermon.date));
      const audioKey = sermon.audioUrl.replace(
        `${process.env.R2_PUBLIC_URL}/`,
        "",
      );

      const keywordsXml = sermon.keywords
        ? `      <itunes:keywords>${escapeXml(sermon.keywords.join(","))}</itunes:keywords>\n`
        : "";

      return `    <item>
      <title>${escapeXml(sermon.title)}</title>
      <description>${escapeXml(sermon.description)}</description>
      <enclosure url="${escapeXml(sermon.audioUrl)}"
                 length="${sermon.audioFileSize}"
                 type="audio/mpeg"/>
      <guid isPermaLink="false">${sermon.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:author>${escapeXml(sermon.speaker)}</itunes:author>
      <itunes:duration>${sermon.durationSeconds}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
${keywordsXml}    </item>`;
    })
    .join("\n");

  const selfUrl = `https://followers-sermon-manager.vercel.app/api/feed`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(meta.link)}</link>
    <language>${meta.language}</language>
    <description>${escapeXml(meta.description)}</description>
    <itunes:author>${escapeXml(meta.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(meta.author)}</itunes:name>
      <itunes:email>${escapeXml(meta.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${escapeXml(meta.imageUrl)}"/>
    <itunes:category text="${escapeXml(meta.category)}">
      <itunes:category text="${escapeXml(meta.subcategory)}"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
