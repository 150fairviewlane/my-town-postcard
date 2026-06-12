import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Parse a fetch Response safely — never throws on non-JSON bodies. */
async function safeJson(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _rawError: text };
  }
}

function extractError(body: Record<string, unknown>, fallback: string): string {
  if (typeof body["_rawError"] === "string" && body["_rawError"]) return body["_rawError"].slice(0, 300);
  const err = body["error"];
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as Record<string, unknown>)["message"]);
  return fallback;
}

// POST /api/admin/image-gen
router.post(
  "/admin/image-gen",
  requireAdmin,
  upload.single("image"),
  async (req, res): Promise<void> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "XAI_API_KEY is not configured on this server." });
      return;
    }

    const prompt = (req.body?.prompt as string | undefined)?.trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    // imageFile can come from a multipart upload OR the client can pass
    // imageUrl (string) so the server fetches it — avoids browser CORS on xAI URLs.
    let imageFile = req.file;
    const incomingImageUrl = (req.body?.imageUrl as string | undefined)?.trim();
    if (!imageFile && incomingImageUrl) {
      try {
        const fetched = await fetch(incomingImageUrl);
        if (!fetched.ok) throw new Error(`Fetch image failed: ${fetched.status}`);
        const arrayBuf = await fetched.arrayBuffer();
        // xAI edits require PNG — force the mime type regardless of what's returned
        imageFile = {
          buffer: Buffer.from(arrayBuf),
          mimetype: "image/png",
          originalname: "image.png",
        } as Express.Multer.File;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: `Could not fetch reference image: ${msg}` });
        return;
      }
    }

    let imageUrl: string;

    try {
      if (imageFile) {
        // Image provided — use /v1/images/edits (multipart)
        const form = new FormData();
        const buf = imageFile.buffer;
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        form.append("image", new Blob([ab], { type: "image/png" }), "image.png");
        form.append("prompt", prompt);
        form.append("model", "grok-imagine-image-quality");
        form.append("response_format", "b64_json");

        logger.info({ prompt: prompt.slice(0, 120) }, "admin-image-gen: calling xAI /images/edits");
        const xaiRes = await fetch("https://api.x.ai/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        const body = await safeJson(xaiRes);
        logger.info({ status: xaiRes.status, bodyPreview: JSON.stringify(body).slice(0, 200) }, "admin-image-gen: edits response");

        if (!xaiRes.ok) {
          res.status(502).json({ error: extractError(body, `xAI /images/edits error ${xaiRes.status}`) });
          return;
        }

        const dataArr = Array.isArray(body["data"]) ? (body["data"] as Record<string, unknown>[]) : [];
        const item = dataArr[0];
        if (item && typeof item["b64_json"] === "string") {
          imageUrl = `data:image/png;base64,${item["b64_json"]}`;
        } else if (item && typeof item["url"] === "string" && item["url"]) {
          imageUrl = item["url"];
        } else {
          res.status(502).json({ error: "No image returned from xAI /images/edits" });
          return;
        }
      } else {
        // Text-only — use /v1/images/generations
        logger.info({ prompt: prompt.slice(0, 120) }, "admin-image-gen: calling xAI /images/generations");
        const xaiRes = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "grok-imagine-image-quality", prompt, n: 1 }),
        });
        const body = await safeJson(xaiRes);
        logger.info({ status: xaiRes.status, bodyPreview: JSON.stringify(body).slice(0, 200) }, "admin-image-gen: generations response");

        if (!xaiRes.ok) {
          res.status(502).json({ error: extractError(body, `xAI /images/generations error ${xaiRes.status}`) });
          return;
        }

        const dataArr = Array.isArray(body["data"]) ? (body["data"] as Record<string, unknown>[]) : [];
        const item = dataArr[0];
        if (item && typeof item["url"] === "string" && item["url"]) {
          imageUrl = item["url"];
        } else if (item && typeof item["b64_json"] === "string") {
          imageUrl = `data:image/png;base64,${item["b64_json"]}`;
        } else {
          res.status(502).json({ error: "No image returned from xAI /images/generations" });
          return;
        }
      }

      res.json({ imageUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "admin-image-gen: unexpected error");
      res.status(500).json({ error: msg });
    }
  },
);

export default router;
