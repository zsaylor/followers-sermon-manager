import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSermons } from "../lib/r2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let sermons = await getSermons();

    // Handle pagination
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    if (limit !== undefined) {
      const start = (page - 1) * limit;
      const end = start + limit;
      sermons = sermons.slice(start, end);
    }

    return res.status(200).json({ sermons });
  } catch (error: any) {
    console.error("Sermons error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
