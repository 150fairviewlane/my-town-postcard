import { db, dealersTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const DOMAIN = "mytownpostcard.com";

export function isCloudflareConfigured(): boolean {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !accountId || !zoneId) {
    logger.warn(
      { hasToken: !!token, hasAccountId: !!accountId, hasZoneId: !!zoneId },
      "Cloudflare Email Routing not configured — skipping email provisioning",
    );
    return false;
  }
  return true;
}

function cfHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN!}`,
    "Content-Type": "application/json",
  };
}

function sanitize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z\-\.]/g, "");
}

export function buildCandidateLocalParts(dealerName: string, limit = 50): string[] {
  const words = dealerName.trim().split(/\s+/).filter(Boolean);
  const first = sanitize(words[0] ?? "dealer");
  const last = sanitize(words[words.length - 1] ?? "");

  const candidates: string[] = [];
  candidates.push(first);
  if (last && last !== first) {
    candidates.push(`${first}.${last}`);
    for (let i = 2; candidates.length < limit; i++) {
      candidates.push(`${first}.${last}${i}`);
    }
  } else {
    for (let i = 2; candidates.length < limit; i++) {
      candidates.push(`${first}${i}`);
    }
  }
  return candidates.filter((c) => c.length > 0);
}

export async function pickAvailableLocalPart(dealerName: string): Promise<string | null> {
  const taken = await db
    .select({ companyEmail: dealersTable.companyEmail })
    .from(dealersTable)
    .where(isNotNull(dealersTable.companyEmail));

  const takenSet = new Set(taken.map((r) => r.companyEmail!.toLowerCase()));
  const candidates = buildCandidateLocalParts(dealerName);
  for (const c of candidates) {
    const full = `${c}@${DOMAIN}`;
    if (!takenSet.has(full)) return c;
  }
  return null;
}

/**
 * Ensures personalEmail exists as a Cloudflare destination address.
 * Returns true only when the address is already verified — meaning a routing
 * rule can safely be created pointing to it.
 * Returns false when the address was just created (verification email sent, not
 * yet clicked) or already exists but is still pending verification. The caller
 * must not create the routing rule until this returns true.
 */
async function ensureDestinationAddress(personalEmail: string): Promise<boolean> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/addresses`;

  const listRes = await fetch(listUrl, { headers: cfHeaders() });
  if (!listRes.ok) {
    logger.warn({ status: listRes.status }, "CF: listing destination addresses failed");
    return false;
  }
  const listData = (await listRes.json()) as { result?: Array<{ email: string; status?: string }> };
  const existing = (listData.result ?? []).find(
    (a) => a.email.toLowerCase() === personalEmail.toLowerCase(),
  );

  if (existing) {
    const verified = existing.status === "verified";
    if (!verified) {
      logger.warn({ personalEmail, cfStatus: existing.status }, "CF: destination address exists but not yet verified — routing rule will be skipped until dealer clicks verification link");
    }
    return verified;
  }

  const createRes = await fetch(listUrl, {
    method: "POST",
    headers: cfHeaders(),
    body: JSON.stringify({ email: personalEmail }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    logger.warn(
      { status: createRes.status, body, personalEmail },
      "CF: creating destination address failed (verification email may not be sent)",
    );
  } else {
    logger.info({ personalEmail }, "CF: destination address created — verification email sent; routing rule will be created on next provisioning attempt after dealer verifies");
  }
  return false; // just created — not verified yet
}

async function createRoutingRule(localPart: string, personalEmail: string): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID!;
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`;
  const body = {
    name: `${localPart}@${DOMAIN}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: `${localPart}@${DOMAIN}` }],
    actions: [{ type: "forward", value: [personalEmail] }],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: cfHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF routing rule creation failed (${res.status}): ${text}`);
  }
  logger.info({ localPart, personalEmail }, "CF: email routing rule created");
}

export async function provisionDealerEmail(
  dealer: { id: number; name: string; email: string; companyEmail?: string | null },
): Promise<string | null> {
  if (dealer.companyEmail) {
    logger.info({ dealerId: dealer.id, companyEmail: dealer.companyEmail }, "CF: dealer already has company email — skipping");
    return dealer.companyEmail;
  }

  if (!isCloudflareConfigured()) return null;

  const localPart = await pickAvailableLocalPart(dealer.name);
  if (!localPart) {
    logger.warn({ dealerId: dealer.id, dealerName: dealer.name }, "CF: no available local-part candidates — skipping");
    return null;
  }

  const companyEmail = `${localPart}@${DOMAIN}`;

  try {
    const verified = await ensureDestinationAddress(dealer.email);
    if (!verified) {
      // Destination address was just created or is still pending verification.
      // Return null so the caller knows provisioning is incomplete. The next
      // call to provisionDealerEmail (e.g. via backfill after the dealer clicks
      // the Cloudflare verification link) will find the address verified and
      // complete the routing rule + DB update.
      logger.info({ dealerId: dealer.id, dealerEmail: dealer.email }, "CF: provisioning deferred — destination address not yet verified");
      return null;
    }
    await createRoutingRule(localPart, dealer.email);

    const { eq } = await import("drizzle-orm");
    await db
      .update(dealersTable)
      .set({ companyEmail })
      .where(eq(dealersTable.id, dealer.id));

    logger.info({ dealerId: dealer.id, companyEmail }, "CF: dealer company email provisioned");

    // Fire-and-forget notification email — provisioning success is already persisted above.
    const { sendDealerCompanyEmailProvisionedEmail } = await import("./emails");
    sendDealerCompanyEmailProvisionedEmail({
      dealerName: dealer.name,
      dealerEmail: dealer.email,
      companyEmail,
    }).catch((e: any) =>
      logger.error({ err: e?.message, dealerId: dealer.id }, "CF: failed to send company email provisioned notification"),
    );

    return companyEmail;
  } catch (err: any) {
    logger.error({ err: err?.message, dealerId: dealer.id }, "CF: provisionDealerEmail failed");
    return null;
  }
}
