/**
 * Server-side in-memory cache for outreach "claim" ad regeneration.
 * Shared between adminScraper (claim-regenerate endpoint) and
 * checkout / webhooks (templateData injection at payment confirmation).
 *
 * All limits reset on server restart — this is intentional. The cache
 * is a fast-lane convenience, not a billing ledger.
 */

export interface ClaimCacheEntry {
  dataUrl: string;
  template: string;
  sizeKey: string;
  expiresAt: number;
}

const adCache = new Map<number, ClaimCacheEntry>();

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;
const ipWindows = new Map<string, { count: number; windowStart: number }>();

const DAILY_CAP = 200;
let dailyCap = { count: 0, dayStart: Date.now() };

export function getCachedAd(businessId: number): ClaimCacheEntry | null {
  const entry = adCache.get(businessId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    adCache.delete(businessId);
    return null;
  }
  return entry;
}

export function setCachedAd(
  businessId: number,
  dataUrl: string,
  template: string,
  sizeKey: string,
  ttlMs = 60 * 60 * 1000,
): void {
  adCache.set(businessId, { dataUrl, template, sizeKey, expiresAt: Date.now() + ttlMs });
}

export function checkAndIncrementIpLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= IP_LIMIT) return false;
  entry.count++;
  return true;
}

export function checkAndIncrementGlobalCap(): boolean {
  const now = Date.now();
  const msIntoDay = now % (24 * 60 * 60 * 1000);
  const todayStart = now - msIntoDay;
  if (dailyCap.dayStart < todayStart) {
    dailyCap = { count: 0, dayStart: todayStart };
  }
  if (dailyCap.count >= DAILY_CAP) return false;
  dailyCap.count++;
  return true;
}
