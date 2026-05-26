import { eq, sql, and, isNull, inArray } from "drizzle-orm";
import {
  db,
  spotSubscriptionsTable,
  subscriptionIssueAssignmentsTable,
  stripeWebhookEventsTable,
  spotsTable,
  campaignsTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  type CommitmentType,
  type SpotSize,
  PLAN_METADATA,
  monthlyPriceCents,
  totalCommitmentValueCents,
} from "./subscriptionPricing";

/**
 * Atomically claim a Stripe webhook event for processing.
 *
 * Returns:
 *   - "fresh"      first time we've seen this event id — caller MUST process
 *                  and then call markWebhookEventProcessed (or _Failed)
 *   - "retry"      we've seen it but the previous attempt either errored
 *                  (status='failed') or was abandoned (status='received')
 *                  — caller MUST re-process; Stripe is retrying after our
 *                  earlier 500 / crash, and we don't want to drop it
 *   - "processed"  already completed successfully on a prior delivery —
 *                  caller MUST short-circuit and return 200 so Stripe stops
 *                  retrying
 *
 * Implemented via INSERT ... ON CONFLICT DO NOTHING so two concurrent
 * webhook retries can't both claim the row on the fresh-insert path; for
 * the retry/processed paths we read the persisted status.
 */
export async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<"fresh" | "retry" | "processed"> {
  try {
    const inserted = await db
      .insert(stripeWebhookEventsTable)
      .values({
        eventId,
        eventType,
        status: "received",
        payload: payload as never,
      })
      .onConflictDoNothing({ target: stripeWebhookEventsTable.eventId })
      .returning({ eventId: stripeWebhookEventsTable.eventId });
    if (inserted.length > 0) return "fresh";

    const [existing] = await db
      .select({ status: stripeWebhookEventsTable.status })
      .from(stripeWebhookEventsTable)
      .where(eq(stripeWebhookEventsTable.eventId, eventId));
    if (existing?.status === "processed") return "processed";
    // status === 'received' (prior attempt crashed before marking) or
    // 'failed' (we returned 500). Either way, Stripe is now retrying;
    // re-process.
    return "retry";
  } catch (err) {
    logger.error({ err, eventId, eventType }, "Failed to record webhook event");
    // On unexpected error, allow processing — better to risk a duplicate
    // (orders unique index will catch it) than to silently drop a real
    // event.
    return "fresh";
  }
}

export async function markWebhookEventProcessed(eventId: string): Promise<void> {
  await db
    .update(stripeWebhookEventsTable)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(stripeWebhookEventsTable.eventId, eventId));
}

export async function markWebhookEventFailed(eventId: string, message: string): Promise<void> {
  await db
    .update(stripeWebhookEventsTable)
    .set({ status: "failed", errorMessage: message.slice(0, 1000), processedAt: new Date() })
    .where(eq(stripeWebhookEventsTable.eventId, eventId));
}

/**
 * Create the pending subscription record + initial assignment when a customer
 * chooses Growth or Premium at checkout. Called BEFORE the Stripe Checkout
 * Session is created so we have a stable `subscriptionRecordId` to pass into
 * the session metadata.
 */
export async function createPendingSubscription(opts: {
  spotId: number;
  campaignId: number;
  size: SpotSize;
  commitmentType: CommitmentType;
  businessName: string;
  businessCategory: string | null;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
}): Promise<{ id: number; monthlyCents: number; totalCents: number }> {
  if (opts.commitmentType === "single") {
    throw new Error("Single-issue purchases do not create subscription records");
  }
  const meta = PLAN_METADATA[opts.commitmentType];
  const monthlyCents = monthlyPriceCents(opts.size, opts.commitmentType);
  const totalCents = totalCommitmentValueCents(opts.size, opts.commitmentType);

  const [sub] = await db
    .insert(spotSubscriptionsTable)
    .values({
      initialSpotId: opts.spotId,
      businessName: opts.businessName,
      businessCategory: opts.businessCategory,
      contactEmail: opts.contactEmail,
      contactPhone: opts.contactPhone,
      website: opts.website,
      size: opts.size,
      commitmentType: opts.commitmentType,
      commitmentTotalIssues: meta.totalIssues,
      monthlyPriceCents: monthlyCents,
      totalCommitmentValueCents: totalCents,
      subscriptionStatus: "pending_payment",
    })
    .returning({ id: spotSubscriptionsTable.id });

  // Stage the initial assignment row (proof_status=pending, included=false)
  // so the issue lineup tooling treats this advertiser as queued for the
  // current campaign from day one. Idempotent on the (sub, campaign)
  // unique index.
  try {
    await db
      .insert(subscriptionIssueAssignmentsTable)
      .values({
        subscriptionId: sub.id,
        campaignId: opts.campaignId,
        spotId: opts.spotId,
        proofStatus: "pending",
        includedInPrint: false,
      })
      .onConflictDoNothing({
        target: [
          subscriptionIssueAssignmentsTable.subscriptionId,
          subscriptionIssueAssignmentsTable.campaignId,
        ],
      });
  } catch (err) {
    logger.error({ err, subscriptionId: sub.id }, "Failed to stage initial issue assignment");
  }

  return { id: sub.id, monthlyCents, totalCents };
}

/**
 * Mark a subscription row active after a successful Stripe Checkout
 * Session, capturing the Stripe IDs and commitment window. Idempotent —
 * safe to call from both the webhook and the synchronous /confirm path.
 */
export async function activateSubscription(opts: {
  subscriptionRecordId: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  commitmentStartDate: Date;
  commitmentEndDate: Date;
}): Promise<boolean> {
  const result = await db
    .update(spotSubscriptionsTable)
    .set({
      subscriptionStatus: "active",
      stripeSubscriptionId: opts.stripeSubscriptionId,
      stripeCustomerId: opts.stripeCustomerId,
      commitmentStartDate: opts.commitmentStartDate,
      commitmentEndDate: opts.commitmentEndDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(spotSubscriptionsTable.id, opts.subscriptionRecordId),
        eq(spotSubscriptionsTable.subscriptionStatus, "pending_payment"),
      ),
    )
    .returning({ id: spotSubscriptionsTable.id });

  return result.length > 0;
}

/**
 * Webhook-driven status update keyed on the Stripe subscription id. Drops
 * events whose payload `created` timestamp is older than the row's
 * updatedAt so out-of-order deliveries can't undo newer state.
 */
export async function updateSubscriptionStatusByStripeId(opts: {
  stripeSubscriptionId: string;
  newStatus: "active" | "past_due" | "canceled" | "ended";
  eventCreatedAt: Date;
  endedAt?: Date;
}): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.stripeSubscriptionId, opts.stripeSubscriptionId));
  if (!existing) return false;
  if (existing.updatedAt && existing.updatedAt.getTime() > opts.eventCreatedAt.getTime()) {
    logger.info(
      { stripeSubscriptionId: opts.stripeSubscriptionId, existingUpdatedAt: existing.updatedAt },
      "Stripe event older than current row state — skipping",
    );
    return false;
  }
  await db
    .update(spotSubscriptionsTable)
    .set({
      subscriptionStatus: opts.newStatus,
      updatedAt: new Date(),
      ...(opts.endedAt ? { commitmentEndDate: opts.endedAt } : {}),
    })
    .where(eq(spotSubscriptionsTable.id, existing.id));
  return true;
}

/**
 * Count of issues actually mailed for a subscription — never stored, always
 * derived from the assignment audit log. This is the SOURCE OF TRUTH for
 * "issues fulfilled".
 */
export async function countFulfilledIssues(subscriptionId: number): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptionIssueAssignmentsTable)
    .where(
      and(
        eq(subscriptionIssueAssignmentsTable.subscriptionId, subscriptionId),
        eq(subscriptionIssueAssignmentsTable.includedInPrint, true),
      ),
    );
  return Number(row?.c ?? 0);
}

/**
 * MRR widget data: sum of monthlyPriceCents across active subscriptions,
 * plus a 30-day projection (committed MRR × months-with-commitment-window
 * during the window). Lightweight enough to compute on every dashboard
 * load; switch to a cache if the row count grows large.
 */
export async function computeMrrSummary(): Promise<{
  activeSubscriptionCount: number;
  monthlyRecurringCents: number;
  expectedNext30DaysCents: number;
}> {
  const rows = await db
    .select({
      monthlyCents: spotSubscriptionsTable.monthlyPriceCents,
      endDate: spotSubscriptionsTable.commitmentEndDate,
    })
    .from(spotSubscriptionsTable)
    .where(
      inArray(spotSubscriptionsTable.subscriptionStatus, ["active", "past_due"] as const),
    );

  const now = Date.now();
  const thirty = now + 30 * 24 * 60 * 60 * 1000;
  let mrr = 0;
  let expected30 = 0;
  for (const r of rows) {
    mrr += r.monthlyCents;
    // Customer keeps paying through commitmentEndDate. If the end date
    // sits inside the next 30 days, count one final invoice; otherwise
    // count a full month.
    const end = r.endDate ? r.endDate.getTime() : Infinity;
    if (end <= now) continue; // already ended, no more charges expected
    expected30 += r.monthlyCents;
    if (end < thirty) {
      // No second charge inside the window — single invoice already counted.
    }
  }
  return {
    activeSubscriptionCount: rows.length,
    monthlyRecurringCents: mrr,
    expectedNext30DaysCents: expected30,
  };
}

/**
 * Look up subscriptions that are eligible to be slotted into a newly
 * created campaign — active, end date in the future, and no existing
 * assignment for this campaign.
 */
export async function findPreCommittedForCampaign(campaignId: number): Promise<
  Array<{
    id: number;
    businessName: string;
    contactEmail: string;
    size: SpotSize;
    commitmentType: CommitmentType;
    issuesFulfilled: number;
    totalIssues: number;
    monthlyPriceCents: number;
    commitmentEndDate: Date | null;
  }>
> {
  const rows = await db.execute<{
    id: number;
    business_name: string;
    contact_email: string;
    size: string;
    commitment_type: string;
    commitment_total_issues: number;
    monthly_price_cents: number;
    commitment_end_date: Date | string | null;
    issues_fulfilled: number;
  }>(sql`
    SELECT
      s.id, s.business_name, s.contact_email, s.size,
      s.commitment_type, s.commitment_total_issues, s.monthly_price_cents,
      s.commitment_end_date,
      COALESCE(SUM(CASE WHEN a.included_in_print THEN 1 ELSE 0 END), 0)::int AS issues_fulfilled
    FROM spot_subscriptions s
    LEFT JOIN subscription_issue_assignments a ON a.subscription_id = s.id
    WHERE s.subscription_status = 'active'
      AND (s.commitment_end_date IS NULL OR s.commitment_end_date > now())
      AND NOT EXISTS (
        SELECT 1 FROM subscription_issue_assignments x
        WHERE x.subscription_id = s.id AND x.campaign_id = ${campaignId}
      )
    GROUP BY s.id
    ORDER BY s.created_at ASC
  `);

  return rows.rows.map((r) => ({
    id: Number(r.id),
    businessName: r.business_name,
    contactEmail: r.contact_email,
    size: r.size as SpotSize,
    commitmentType: r.commitment_type as CommitmentType,
    issuesFulfilled: Number(r.issues_fulfilled ?? 0),
    totalIssues: Number(r.commitment_total_issues),
    monthlyPriceCents: Number(r.monthly_price_cents),
    commitmentEndDate:
      r.commitment_end_date instanceof Date
        ? r.commitment_end_date
        : r.commitment_end_date
          ? new Date(r.commitment_end_date)
          : null,
  }));
}

/**
 * Called by the admin "Complete Campaign" action. Flips every approved
 * assignment for the campaign to included_in_print=true with the mailed
 * timestamp. This is the ONLY place where issues are counted as fulfilled.
 */
export async function markCampaignAssignmentsMailed(campaignId: number): Promise<number> {
  const result = await db
    .update(subscriptionIssueAssignmentsTable)
    .set({ includedInPrint: true, mailedAt: new Date() })
    .where(
      and(
        eq(subscriptionIssueAssignmentsTable.campaignId, campaignId),
        eq(subscriptionIssueAssignmentsTable.proofStatus, "approved"),
        eq(subscriptionIssueAssignmentsTable.includedInPrint, false),
      ),
    )
    .returning({ id: subscriptionIssueAssignmentsTable.id });
  return result.length;
}

/**
 * Returns subscriptions due for each step of the renewal email sequence.
 * The renewal scheduler calls this every hour to pick up the next batch.
 *
 *   T-30:  end within 25-35 days AND t30 unsent
 *   T-7:   end within 4-9 days   AND t7 unsent
 *   post:  end <= now() within last 7 days AND post unsent
 */
export async function findRenewalCandidates(): Promise<{
  t30: Array<{ id: number; businessName: string; contactEmail: string; commitmentEndDate: Date }>;
  t7: Array<{ id: number; businessName: string; contactEmail: string; commitmentEndDate: Date }>;
  post: Array<{ id: number; businessName: string; contactEmail: string; commitmentEndDate: Date }>;
}> {
  const project = (rows: any[]) =>
    rows.map((r) => ({
      id: Number(r.id),
      businessName: String(r.business_name),
      contactEmail: String(r.contact_email),
      commitmentEndDate: r.commitment_end_date instanceof Date
        ? r.commitment_end_date
        : new Date(r.commitment_end_date),
    }));

  const t30Rows = await db.execute<any>(sql`
    SELECT id, business_name, contact_email, commitment_end_date
    FROM spot_subscriptions
    WHERE subscription_status = 'active'
      AND commitment_end_date IS NOT NULL
      AND commitment_end_date > now() + interval '25 days'
      AND commitment_end_date < now() + interval '35 days'
      AND renewal_email_t30_at IS NULL
  `);
  const t7Rows = await db.execute<any>(sql`
    SELECT id, business_name, contact_email, commitment_end_date
    FROM spot_subscriptions
    WHERE subscription_status = 'active'
      AND commitment_end_date IS NOT NULL
      AND commitment_end_date > now() + interval '4 days'
      AND commitment_end_date < now() + interval '9 days'
      AND renewal_email_t7_at IS NULL
  `);
  const postRows = await db.execute<any>(sql`
    SELECT id, business_name, contact_email, commitment_end_date
    FROM spot_subscriptions
    WHERE commitment_end_date IS NOT NULL
      AND commitment_end_date <= now()
      AND commitment_end_date > now() - interval '7 days'
      AND renewal_email_post_at IS NULL
  `);
  return {
    t30: project(t30Rows.rows),
    t7: project(t7Rows.rows),
    post: project(postRows.rows),
  };
}

export async function markRenewalEmailSent(
  subscriptionId: number,
  field: "renewalEmailT30At" | "renewalEmailT7At" | "renewalEmailPostAt",
): Promise<void> {
  await db
    .update(spotSubscriptionsTable)
    .set({ [field]: new Date() } as never)
    .where(eq(spotSubscriptionsTable.id, subscriptionId));
}

// Reference unused imports to satisfy strict TS without hurting bundle.
void isNull;
void spotsTable;
void campaignsTable;
