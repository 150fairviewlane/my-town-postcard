# Multi-Issue Subscription Test Plan

Manual + integration checklist for project task #84 (Growth Plan + Premium
Visibility Plan). Walk through every block end-to-end against a sandbox
Stripe account before flipping the live keys.

## Happy paths (manual)

### One-time path is untouched
1. Open the picker, pick any available spot, fill reservation info, click **Continue to payment**.
2. CheckoutPage shows the three plan cards. Default = **One-Time Placement**.
3. Pay with `4242 4242 4242 4242`. Confirm: redirect to existing `/confirmation/:spotId`, spot flips to `paid`, admin email arrives.
4. **Verify in DB:** `orders` row created, `spot_subscriptions` UNTOUCHED.

### Growth Plan (6 issues)
1. Reserve a fresh spot, click into CheckoutPage, pick **Growth Plan**.
2. Order summary shows the right monthly + 6-month total (e.g. XL: $449/mo × 6 = $2,694).
3. Click **Continue to Stripe Checkout** → Stripe-hosted page loads with the Growth Plan label.
4. Pay with `4242 4242 4242 4242`.
5. Land on `/subscription-confirmation?session_id=...` — celebration card shows monthly/total/issues.
6. **Verify in DB:**
   - `spot_subscriptions` row: `subscription_status='active'`, `commitment_total_issues=6`, `commitment_end_date≈now()+6mo`.
   - `subscription_issue_assignments` row for the active campaign with `proof_status='pending'`, `included_in_print=false`.
   - `orders` row: `amount_cents=monthly` (NOT total), `stripe_payment_intent_id=sub_...`.
   - `spots`: status=`paid`, `expires_at=null`, `tracking_code` populated.
7. **Verify in Stripe Dashboard:** subscription has `cancel_at` set to commitmentEndDate, metadata `kind=spot_subscription`.
8. **Verify emails:** customer + admin both received subscription-specific templates.

### Premium Visibility Plan (12 issues)
- Same as Growth but pick **Premium Visibility Plan** (12 mo, 20% discount). Confirm card highlights "Best Value" and pricing math reflects 20% off.

## Idempotency & race safety

### Webhook deduplication
1. In Stripe Dashboard → Webhooks, click an old `checkout.session.completed` event and **Resend**.
2. Server log shows `Stripe webhook already processed — idempotent no-op`.
3. `stripe_webhook_events` table has exactly one row for that event_id.

### Webhook vs synchronous confirm race
1. Disconnect from internet between paying and the redirect (or watch the network tab and let webhook fire first).
2. Both `/checkout/subscription-confirm` and the webhook should be safe — only one `orders` row exists (unique index on `stripe_payment_intent_id`).
3. Re-hitting `/subscription-confirmation?session_id=...` is idempotent.

### Reservation expiry mid-checkout
1. Reserve a spot, leave it untouched 30+ minutes, then come back and pick Growth Plan.
2. Expect 400 from `/api/checkout/create-subscription-session` ("Spot must be reserved before payment").

## Lifecycle (manual + Stripe Dashboard)

### Renewal at term end (cancel_at fires)
1. Create a subscription, then in Stripe Dashboard edit the subscription to set `cancel_at` to "in 1 minute" (you can't easily fast-forward locally).
2. Wait for Stripe to fire `customer.subscription.deleted`.
3. **Verify:** local row flips to `subscription_status='canceled'`, lineup endpoint stops returning this advertiser.

### Failed payment → past_due → recovers
1. In Stripe, change the customer's default payment method to a card that triggers `4000 0000 0000 0341` (charge declines on subsequent payments).
2. Trigger the next invoice manually.
3. **Verify:** `invoice.payment_failed` flips local row to `past_due`. Lineup endpoint excludes them.
4. Update card to `4242…`, trigger invoice again. `invoice.payment_succeeded` → local flips back to `active`.

### Reconcile button (admin)
1. Manually `UPDATE spot_subscriptions SET subscription_status='past_due' WHERE id=…;` on an active sub.
2. Click **Reconcile with Stripe** on `/admin/subscriptions`. Local row corrects back to active.

## Lineup integration

### Pre-committed pulled into new campaign
1. Have ≥1 active multi-issue subscription with `commitment_end_date > now()`.
2. As admin, create a new campaign.
3. `GET /api/admin/campaigns/<new id>/preCommitted` returns the subscriber. Issue counter shows `n/total`.

### Campaign complete flips assignments mailed
1. With an active sub, approve its proof for the current campaign:
   `POST /admin/subscriptions/:id/assignments/:campaignId/approve-proof`.
2. Complete the campaign via the admin UI.
3. **Verify:** `subscription_issue_assignments.included_in_print=true`, `mailed_at` populated. The subscriber's "issues fulfilled" counter increments by 1 on the admin Subscriptions page.

## Renewal emails

The renewal scheduler runs hourly (`startRenewalScheduler(60*60*1000)` in
`src/index.ts`). To test without waiting:

1. Manually `UPDATE spot_subscriptions SET commitment_end_date = now() + interval '30 days' WHERE id=…;`.
2. Restart the API server — the scheduler fires once immediately on boot.
3. Confirm `renewal_email_t30_at` is now set and a Resend email was logged.
4. Repeat with `+7 days` for T-7 and `-1 day` for the post-end email.

## Regression sweeps

- One-time PaymentIntent path: pay a spot the old way. Everything still works.
- Dealer signup flow: a dealer can still sign up (the new webhook dedup table doesn't affect dealer code).
- Admin dashboard, campaigns, spots, scans, prints — all still render.
- `pnpm run typecheck` is clean.

## Cleanup after testing

```sql
DELETE FROM subscription_issue_assignments WHERE subscription_id IN (SELECT id FROM spot_subscriptions WHERE contact_email LIKE '%test%');
DELETE FROM spot_subscriptions WHERE contact_email LIKE '%test%';
DELETE FROM stripe_webhook_events WHERE received_at < now() - interval '7 days';
```
