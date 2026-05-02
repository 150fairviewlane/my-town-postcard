import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// AI chat proxy → Anthropic
//
// This route is hit by the in-app Ad Assistant. The previous version of this
// handler did `await fetch(...)` then `res.json(data)` and only caught network
// errors, so any non-2xx Anthropic response (404, 429, 5xx) was forwarded to
// the browser AS HTTP 200 with an opaque body, and the client surfaced
// confusing strings like "Request failed (404)" with no recovery.
//
// This version:
//   1. Validates the request body (returns 400 with a clear message).
//   2. Aborts after a 30-second timeout so the request never hangs.
//   3. Retries with exponential backoff on transient errors (429 + 5xx +
//      network/timeout errors), up to 2 retries (3 total attempts).
//   4. Forwards Anthropic's status and a normalized {error: string} body so
//      the client can always display a meaningful message.
//   5. Logs every attempt with structured fields for debugging.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 400;
const TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [400, 1200];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post("/ai/chat", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY environment variable is not set");
    res.status(500).json({ error: "AI service is not configured." });
    return;
  }

  const system = req.body?.system;
  const messages = req.body?.messages;
  if (typeof system !== "string" || !system.trim()) {
    res.status(400).json({ error: "Missing or empty system prompt" });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Missing or empty messages array" });
    return;
  }

  const upstreamBody = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  const totalAttempts = 1 + RETRY_DELAYS_MS.length;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: upstreamBody,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const text = await response.text();
      let data: { error?: { message?: string; type?: string } | string; content?: unknown } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // body was not JSON — keep `text` for diagnostics
      }

      // Happy path
      if (response.ok && data && !data.error) {
        res.json(data);
        return;
      }

      // Anthropic returned non-2xx OR a JSON body with an error envelope.
      const errPayload = data?.error;
      const errMsg =
        (typeof errPayload === "object" && errPayload?.message) ||
        (typeof errPayload === "string" && errPayload) ||
        text ||
        `Upstream returned HTTP ${response.status}`;

      req.log.warn(
        {
          attempt: attempt + 1,
          totalAttempts,
          status: response.status,
          anthropicError: errPayload,
        },
        "Anthropic API non-2xx response",
      );

      const isRetryable = response.status === 429 || response.status >= 500;
      if (isRetryable && attempt < totalAttempts - 1) {
        continue;
      }

      // Map upstream status to a sensible client status:
      //   - 429 → 429 (rate limit)
      //   - 4xx (other) → forward as-is, since the client request was bad
      //   - 5xx or 404 (model not found) → 502 (bad gateway), since the user
      //     can't fix it and 404 would be misleading (it isn't a missing route)
      let clientStatus: number;
      if (response.status === 429) clientStatus = 429;
      else if (response.status === 404 || response.status >= 500) clientStatus = 502;
      else if (response.status >= 400) clientStatus = response.status;
      else clientStatus = 502;

      res.status(clientStatus).json({ error: String(errMsg) });
      return;
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const isAbort = e?.name === "AbortError" || e?.name === "TimeoutError";
      const errMsg = isAbort
        ? "AI service timed out — please try again."
        : e?.message || "Network error reaching AI service.";

      req.log.warn(
        {
          attempt: attempt + 1,
          totalAttempts,
          err: { name: e?.name, message: e?.message },
          isAbort,
        },
        "ai/chat fetch failed",
      );

      if (attempt < totalAttempts - 1) continue;

      res.status(503).json({ error: errMsg });
      return;
    }
  }

  // Defensive fallback — should be unreachable because the loop always
  // either returns a response or continues.
  req.log.error("ai/chat handler exited loop without responding");
  if (!res.headersSent) {
    res
      .status(503)
      .json({ error: "AI service is temporarily unavailable. Please try again." });
  }
});

export default router;
