import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "../lib/auth";
import { getSermons, putSermons, deleteAudio, PUBLIC_URL } from "../lib/r2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    if (auth.status === 429) {
      if (auth.retryAfterSeconds) {
        res.setHeader("Retry-After", String(auth.retryAfterSeconds));
      }
      return res.status(429).json({ error: auth.error });
    }
    return res.status(401).json({ error: auth.error });
  }

  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Missing sermon ID" });
    }

    const sermons = await getSermons();
    const sermonIndex = sermons.findIndex((s) => s.id === id);

    if (sermonIndex === -1) {
      return res.status(404).json({ error: "Sermon not found" });
    }

    const sermon = sermons[sermonIndex];

    // Extract the key from the audio URL
    const audioKey = sermon.audioUrl.replace(`${PUBLIC_URL}/`, "");

    // Delete the audio file from R2
    await deleteAudio(audioKey);

    // Remove sermon from array
    sermons.splice(sermonIndex, 1);

    // Save updated sermons.json
    await putSermons(sermons);

    return res.status(200).json({ message: "Sermon deleted successfully" });
  } catch (error: any) {
    console.error("Delete error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
