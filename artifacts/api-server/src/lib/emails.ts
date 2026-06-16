import { logger } from "./logger";

interface OrderInfo {
  businessName: string;
  contactEmail: string;
  spotSize: string;
  spotPrice: number;
  spotId: number;
  orderId: number;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set — email sending skipped");
    return null;
  }
  const { Resend } = require("resend");
  return new Resend(apiKey);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@mytownpostcard.com";
// Default to Resend's always-verified sandbox sender so emails go through
// out of the box. Override with FROM_EMAIL once mytownpostcard.com is
// verified in the Resend dashboard.
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://mytownpostcard.com";

interface AdProofInfo {
  businessName: string;
  contactEmail: string;
  spotSize: string;
  spotPrice: number;
  spotId: number;
  orderId: number;
  campaignName: string | null;
  mailDate: string | null; // YYYY-MM-DD or human-readable string
  // Anything we have on file that the customer's ad will display.
  // Phone and website come from the spot row; tagline / offer / address
  // are visual elements baked into the approved ad design itself.
  contactPhone: string | null;
  website: string | null;
  industry: string | null;
}

const formatMailDate = (raw: string | null): string => {
  if (!raw) return "TBD";
  // mail_date is stored as TEXT (free-form), but the admin form writes it
  // as YYYY-MM-DD. Try to humanize that; otherwise pass it through.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }
  return raw;
};

const escapeHtml = (s: string | null | undefined): string => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/**
 * Sends the customer's "ad proof" email after their Stripe payment succeeds
 * and the spot has transitioned to paid. Replaces the older plain-text
 * reservation confirmation. The email is intentionally simple: a clean HTML
 * summary of the ad as it will appear in print, a "locked-in" reassurance
 * note, and a CTA back to the confirmation/details page.
 *
 * Idempotency note: the caller (markSpotPaidAndNotify in webhooks.ts and the
 * synchronous /checkout/confirm handler) only invokes this once per order
 * thanks to the unique payment-intent index on `orders`, so we don't dedup
 * here.
 */
export async function sendAdProofEmail(info: AdProofInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend || !info.contactEmail) return;

  const safe = {
    businessName: escapeHtml(info.businessName),
    spotSize: escapeHtml(info.spotSize.toUpperCase()),
    campaignName: escapeHtml(info.campaignName ?? "My Town Postcard"),
    industry: escapeHtml(info.industry),
    phone: escapeHtml(info.contactPhone),
    website: escapeHtml(info.website),
    mailDate: escapeHtml(formatMailDate(info.mailDate)),
  };
  const priceStr = `$${(info.spotPrice / 100).toFixed(2)}`;

  // Build the "What will appear on your ad" list. Phone and website are
  // values we have on file and can display verbatim. Tagline / offer /
  // address are visual elements built into the approved ad design itself,
  // so we list them by name with a short reassurance instead of pretending
  // we have the literal copy stored.
  const adFieldRow = (label: string, value: string, fallback: string) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #6b7280; font-size: 13px; width: 35%;">${label}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #111; font-size: 14px;">${value || `<span style="color:#9ca3af; font-style: italic;">${fallback}</span>`}</td>
    </tr>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.contactEmail,
      subject: `Your ad is locked in — ${info.businessName} on ${safe.campaignName}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; padding: 32px; background: #f9fafb;">
          <div style="background: #991b1b; padding: 18px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">📮 My Town Postcard</h1>
          </div>
          <div style="background: #fff; border: 1px solid #e5e7eb; padding: 32px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111; font-size: 22px; margin-top: 0;">Your ad is locked in! 🎉</h2>
            <p style="color: #374151; font-size: 15px; line-height: 1.55;">
              Hi <strong>${safe.businessName}</strong>, thanks for your payment — your spot on the upcoming postcard is reserved and your ad design is finalized.
            </p>

            <h3 style="color: #111; font-size: 15px; margin-top: 28px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Order Summary</h3>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; width: 35%;">Business</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; font-weight: 600;">${safe.businessName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Ad Size</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${safe.spotSize}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Price Paid</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb; font-weight: 600;">${priceStr}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Campaign</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${safe.campaignName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Mailing Date</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${safe.mailDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Order #</td>
                <td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${info.orderId}</td>
              </tr>
            </table>

            <h3 style="color: #111; font-size: 15px; margin-top: 28px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">What Will Appear on Your Ad</h3>
            <table style="width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #f1f5f9; border-radius: 8px; overflow: hidden;">
              ${adFieldRow("Tagline", "", "As shown in your approved design")}
              ${adFieldRow("Offer", "", "As shown in your approved design")}
              ${adFieldRow("Phone", safe.phone, "Not provided")}
              ${adFieldRow("Address", "", "As shown in your approved design")}
              ${adFieldRow("Website", safe.website, "Not provided")}
            </table>

            <div style="background: #f0fdf4; border-left: 4px solid #15803d; border-radius: 6px; padding: 14px 16px; margin: 24px 0;">
              <p style="margin: 0; color: #14532d; font-size: 14px; line-height: 1.5;">
                ✓ <strong>Your design is locked in.</strong> Your ad will appear exactly as you approved it. No further changes are needed on your end.
              </p>
            </div>

            <p style="text-align: center; margin: 28px 0;">
              <a href="${APP_URL}/confirmation/${info.spotId}"
                 style="display: inline-block; background: #991b1b; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                View Your Ad Details →
              </a>
            </p>

            <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; text-align: center; line-height: 1.5;">
              My Town Postcard · mytownpostcard.com<br>
              Questions? Reply to this email and we'll get right back to you.
            </p>
          </div>
        </div>
      `,
    });
    logger.info({ orderId: info.orderId, spotId: info.spotId }, "Ad proof email sent");
  } catch (err) {
    logger.error({ err, orderId: info.orderId }, "Failed to send ad proof email");
  }
}

interface CampaignCompletedInfo {
  campaignId: number;
  name: string;
  territory: string;
  totalSpots: number;
  paidSpots: number;
  totalRevenueCents: number;
  homesCount: number;
}

export async function sendCampaignCompletedAdminEmail(
  info: CampaignCompletedInfo,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const dollars = (info.totalRevenueCents / 100).toFixed(2);
  const sellThru = info.totalSpots
    ? Math.round((info.paidSpots / info.totalSpots) * 100)
    : 0;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Campaign completed: ${info.name} — $${dollars} (${info.paidSpots}/${info.totalSpots} spots sold)`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Campaign Completed</h2>
          <p>The <strong>${info.name}</strong> campaign in ${info.territory} has been marked complete. New purchases are locked.</p>
          <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Campaign #</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${info.campaignId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Territory</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${info.territory}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Homes Mailed</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${info.homesCount.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Spots Sold</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${info.paidSpots} / ${info.totalSpots} (${sellThru}% sell-through)</td></tr>
            <tr><td style="padding: 8px;"><strong>Total Revenue</strong></td><td style="padding: 8px;">$${dollars}</td></tr>
          </table>
          <p style="margin-top: 16px;"><a href="${APP_URL}/admin">Open Admin Dashboard →</a></p>
        </div>
      `,
    });
    logger.info({ campaignId: info.campaignId }, "Campaign completed admin email sent");
  } catch (err) {
    logger.error({ err, campaignId: info.campaignId }, "Failed to send campaign completed email");
  }
}

// =============================================================================
// Multi-issue subscription emails (Growth Plan / Premium Visibility Plan).
// These are NEW templates — the single-issue email path (sendAdProofEmail
// above) is unchanged so the one-time PaymentIntent flow has zero
// regression risk.
// =============================================================================

interface SubscriptionConfirmInfo {
  businessName: string;
  contactEmail: string;
  spotSize: string;
  spotId: number;
  orderId: number;
  commitmentType: "single" | "6_issue" | "12_issue";
  totalIssues: number;
  monthlyCents: number;
  totalCents: number;
  commitmentEndDate: Date;
  campaignName: string | null;
  mailDate: string | null;
}

const PLAN_LABEL: Record<string, string> = {
  "6_issue": "Growth Plan",
  "12_issue": "Premium Visibility Plan",
  single: "One-Time Placement",
};

export async function sendSubscriptionConfirmationEmail(
  info: SubscriptionConfirmInfo,
): Promise<void> {
  const resend = getResendClient();
  if (!resend || !info.contactEmail) return;
  const planLabel = PLAN_LABEL[info.commitmentType] ?? "Subscription";
  const monthly = `$${(info.monthlyCents / 100).toFixed(2)}`;
  const total = `$${(info.totalCents / 100).toFixed(2)}`;
  const endStr = info.commitmentEndDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.contactEmail,
      subject: `Welcome to the ${planLabel} — ${info.totalIssues} issues locked in`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; padding: 32px; background: #f9fafb;">
          <div style="background: #991b1b; padding: 18px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">📮 LocalSpot Mailer</h1>
          </div>
          <div style="background: #fff; border: 1px solid #e5e7eb; padding: 32px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111; font-size: 22px; margin-top: 0;">You're locked in for ${info.totalIssues} consecutive issues 🎉</h2>
            <p style="color: #374151; font-size: 15px; line-height: 1.55;">
              Hi <strong>${escapeHtml(info.businessName)}</strong>, thanks for committing to the
              <strong>${planLabel}</strong>. Your first issue is already on the next campaign, and
              we'll automatically place your ad in the following ${info.totalIssues - 1} issues — no
              re-purchase needed each time.
            </p>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden; margin-top: 16px;">
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; width: 40%;">Plan</td><td style="padding: 10px 12px; color: #111; font-size: 14px; font-weight: 600;">${planLabel}</td></tr>
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Issues Included</td><td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${info.totalIssues}</td></tr>
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Ad Size</td><td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${escapeHtml(info.spotSize.toUpperCase())}</td></tr>
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Billing</td><td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${monthly} / month</td></tr>
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Total Commitment</td><td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb; font-weight: 600;">${total}</td></tr>
              <tr><td style="padding: 10px 12px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Final Issue Ships</td><td style="padding: 10px 12px; color: #111; font-size: 14px; border-top: 1px solid #e5e7eb;">${endStr}</td></tr>
            </table>
            <div style="background: #f0fdf4; border-left: 4px solid #15803d; border-radius: 6px; padding: 14px 16px; margin: 24px 0;">
              <p style="margin: 0; color: #14532d; font-size: 14px; line-height: 1.5;">
                ✓ <strong>No auto-renewal.</strong> Your billing stops automatically after ${info.totalIssues} issues. We'll email you 30 days and 7 days before your term ends if you'd like to renew.
              </p>
            </div>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${APP_URL}/confirmation/${info.spotId}" style="display: inline-block; background: #991b1b; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">View Your Ad Details →</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; text-align: center;">LocalSpot Mailer · Reply to this email any time.</p>
          </div>
        </div>
      `,
    });
    logger.info({ orderId: info.orderId, spotId: info.spotId, commitmentType: info.commitmentType }, "Subscription confirmation email sent");
  } catch (err) {
    logger.error({ err, orderId: info.orderId }, "Failed to send subscription confirmation email");
  }
}

interface AdminSubscriptionInfo {
  businessName: string;
  contactEmail: string;
  spotSize: string;
  commitmentType: "single" | "6_issue" | "12_issue";
  totalIssues: number;
  monthlyCents: number;
  totalCents: number;
  subscriptionRecordId: number;
}

export async function sendAdminNewSubscriptionEmail(info: AdminSubscriptionInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;
  const planLabel = PLAN_LABEL[info.commitmentType] ?? info.commitmentType;
  const monthly = `$${(info.monthlyCents / 100).toFixed(2)}`;
  const total = `$${(info.totalCents / 100).toFixed(2)}`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🎉 New ${planLabel}: ${info.businessName} (${total} committed)`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>New Subscription Commitment</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Business</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.businessName)} (${escapeHtml(info.contactEmail)})</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Plan</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${planLabel} — ${info.totalIssues} issues</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Ad Size</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.spotSize.toUpperCase())}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Monthly</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${monthly}</td></tr>
            <tr><td style="padding: 8px;"><strong>Total Committed</strong></td><td style="padding: 8px;"><strong>${total}</strong></td></tr>
          </table>
          <p style="margin-top: 16px;"><a href="${APP_URL}/admin">Open Admin Dashboard →</a></p>
        </div>
      `,
    });
    logger.info({ subscriptionRecordId: info.subscriptionRecordId }, "Admin new subscription email sent");
  } catch (err) {
    logger.error({ err, subscriptionRecordId: info.subscriptionRecordId }, "Failed to send admin new subscription email");
  }
}

interface RenewalEmailInfo {
  businessName: string;
  contactEmail: string;
  commitmentEndDate: Date;
  appUrl?: string;
}

export async function sendRenewalT30Email(info: RenewalEmailInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend || !info.contactEmail) return;
  const endStr = info.commitmentEndDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.contactEmail,
      subject: `Your LocalSpot subscription ends ${endStr} — keep your spot?`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>30 days left on your subscription</h2>
          <p>Hi ${escapeHtml(info.businessName)}, your committed run of issues ends on <strong>${endStr}</strong>.</p>
          <p>Renew now to keep the same spot, locked-in pricing, and uninterrupted coverage. Replying to this email is the fastest way to renew.</p>
          <p><a href="${APP_URL}/">Renew or browse the next issue →</a></p>
        </div>
      `,
    });
    logger.info({ contactEmail: info.contactEmail }, "Renewal T-30 email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send T-30 renewal email");
  }
}

export async function sendRenewalT7Email(info: RenewalEmailInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend || !info.contactEmail) return;
  const endStr = info.commitmentEndDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.contactEmail,
      subject: `1 week left — renew before your spot opens up`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>1 week left on your subscription</h2>
          <p>Hi ${escapeHtml(info.businessName)}, just a heads-up — your run ends on <strong>${endStr}</strong>. After that, your spot opens back up to new advertisers.</p>
          <p>Reply to this email or visit your dashboard to renew at the same plan and price.</p>
          <p><a href="${APP_URL}/">Renew now →</a></p>
        </div>
      `,
    });
    logger.info({ contactEmail: info.contactEmail }, "Renewal T-7 email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send T-7 renewal email");
  }
}

export async function sendRenewalPostEmail(info: RenewalEmailInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend || !info.contactEmail) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.contactEmail,
      subject: `Thanks for running with LocalSpot — ready for round two?`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Your committed run is complete</h2>
          <p>Hi ${escapeHtml(info.businessName)}, thanks for running with us through your full commitment. Many of our best results show up between issues 6 and 12 — would you like to keep going?</p>
          <p><a href="${APP_URL}/">Pick your next plan →</a></p>
        </div>
      `,
    });
    logger.info({ contactEmail: info.contactEmail }, "Renewal post email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send post-end renewal email");
  }
}

interface AdminNewDealerInfo {
  dealerId: number;
  dealerName: string;
  dealerEmail: string;
  territoryName: string | null;
}

export async function sendAdminNewDealerEmail(info: AdminNewDealerInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const adminUrl = `${APP_URL}/admin/dealers?id=${info.dealerId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🎉 New dealer activated: ${info.dealerName}${info.territoryName ? ` — ${info.territoryName}` : ""}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>New Dealer Activated</h2>
          <p>A dealer just completed payment and is now live.</p>
          <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.dealerName)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.dealerEmail)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Territory</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.territoryName ?? "—")}</td></tr>
            <tr><td style="padding: 8px;"><strong>Dealer ID</strong></td><td style="padding: 8px;">${info.dealerId}</td></tr>
          </table>
          <p style="margin-top: 24px;">
            <a href="${adminUrl}" style="display: inline-block; background: #991b1b; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
              View Dealers in Admin →
            </a>
          </p>
        </div>
      `,
    });
    logger.info({ dealerId: info.dealerId }, "Admin new dealer email sent");
  } catch (err) {
    logger.error({ err, dealerId: info.dealerId }, "Failed to send admin new dealer email");
  }
}

interface AdminDealerCancelledInfo {
  dealerId: number;
  dealerName: string;
  dealerEmail: string;
  territoryName: string | null;
}

export async function sendAdminDealerCancelledEmail(info: AdminDealerCancelledInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const adminUrl = `${APP_URL}/admin/dealers?id=${info.dealerId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `⚠️ Dealer subscription cancelled: ${info.dealerName}${info.territoryName ? ` — ${info.territoryName}` : ""}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Dealer Subscription Cancelled</h2>
          <p>A dealer's subscription has been cancelled (payment failure or Stripe cancellation). Their territory has been released.</p>
          <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.dealerName)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.dealerEmail)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Territory</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(info.territoryName ?? "—")}</td></tr>
            <tr><td style="padding: 8px;"><strong>Dealer ID</strong></td><td style="padding: 8px;">${info.dealerId}</td></tr>
          </table>
          <p style="margin-top: 24px;">
            <a href="${adminUrl}" style="display: inline-block; background: #991b1b; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
              View Dealers in Admin →
            </a>
          </p>
        </div>
      `,
    });
    logger.info({ dealerId: info.dealerId }, "Admin dealer cancelled email sent");
  } catch (err) {
    logger.error({ err, dealerId: info.dealerId }, "Failed to send admin dealer cancelled email");
  }
}

export async function sendAdminNewOrder(order: OrderInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `New paid order: ${order.businessName} — $${(order.spotPrice / 100).toFixed(2)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>New Paid Order</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Business</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${order.businessName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${order.contactEmail}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Spot Size</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${order.spotSize}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Amount</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${(order.spotPrice / 100).toFixed(2)}</td></tr>
            <tr><td style="padding: 8px;"><strong>Order #</strong></td><td style="padding: 8px;">${order.orderId}</td></tr>
          </table>
          <p><a href="${APP_URL}/admin">View in Admin Dashboard →</a></p>
        </div>
      `,
    });
    logger.info({ orderId: order.orderId }, "Admin new order email sent");
  } catch (err) {
    logger.error({ err, orderId: order.orderId }, "Failed to send admin email");
  }
}

// ─── Territory Claim Emails (dealer-facing) ──────────────────────────────────

export interface TerritoryClaimedEmailInfo {
  dealerName: string;
  dealerEmail: string;
  territoryName: string;
  cities: string[];
  portalToken?: string | null;
}

/**
 * Sent to a dealer the moment their territory is activated (Stripe payment
 * cleared + territory materialized). No admin approval step exists anymore.
 */
export async function sendTerritoryClaimedEmail(
  info: TerritoryClaimedEmailInfo
): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.info(
      { territory: info.territoryName, dealer: info.dealerEmail },
      "Territory claimed (email skipped — RESEND_API_KEY not set)"
    );
    return;
  }
  const portalUrl = info.portalToken
    ? `${APP_URL}/my-territory?token=${encodeURIComponent(info.portalToken)}`
    : `${APP_URL}/my-territory`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.dealerEmail,
      subject: `Your territory is live — ${escapeHtml(info.territoryName)}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Welcome aboard, ${escapeHtml(info.dealerName)}! 🎉</h2>
          <p>Your exclusive territory <strong>${escapeHtml(info.territoryName)}</strong> is now active.</p>
          ${info.cities.length > 0 ? `<p><strong>Mailing areas:</strong> ${escapeHtml(info.cities.join(", "))}</p>` : ""}
          <p>Each postcard mailing reaches ≈5,000 households via USPS EDDM.</p>
          <p><a href="${portalUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open your dealer portal →</a></p>
        </div>
      `,
    });
    logger.info({ territory: info.territoryName }, "Territory claimed email sent");
  } catch (err) {
    logger.error({ err, territory: info.territoryName }, "Failed to send territory claimed email");
  }
}

export interface TerritoryConflictEmailInfo {
  dealerName: string;
  dealerEmail: string;
  territoryName: string;
}

/**
 * Sent when a territory claim is refunded because an overlapping territory was
 * taken during checkout (the post-payment 25-mile conflict re-check failed).
 */
export async function sendTerritoryConflictEmail(
  info: TerritoryConflictEmailInfo
): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.info(
      { territory: info.territoryName, dealer: info.dealerEmail },
      "Territory conflict refund (email skipped — RESEND_API_KEY not set)"
    );
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.dealerEmail,
      subject: `Refund issued — ${escapeHtml(info.territoryName)} was just claimed`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">We're sorry, ${escapeHtml(info.dealerName)}</h2>
          <p>Another dealer claimed an overlapping area for
          <strong>${escapeHtml(info.territoryName)}</strong> moments before your
          payment finished processing, so we could not activate it.</p>
          <p><strong>Your payment has been fully refunded</strong> and your
          subscription cancelled — you will not be charged.</p>
          <p>Please pick a different nearby area on the territory finder, or reply
          to this email and we'll help you find one.</p>
          <p><a href="${APP_URL}/find-territory">Find another territory →</a></p>
        </div>
      `,
    });
    logger.info({ territory: info.territoryName }, "Territory conflict email sent");
  } catch (err) {
    logger.error({ err, territory: info.territoryName }, "Failed to send territory conflict email");
  }
}

export interface DealerPasswordResetEmailInfo {
  dealerName: string;
  dealerEmail: string;
  resetLink: string;
}

export interface DealerWelcomeEmailInfo {
  dealerName: string;
  dealerEmail: string;
  territoryName: string | null;
  setPasswordLink: string;
  loginLink: string;
}

export async function sendDealerWelcomeEmail(
  info: DealerWelcomeEmailInfo
): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.info(
      { dealer: info.dealerEmail },
      "Dealer welcome email skipped — RESEND_API_KEY not set"
    );
    return;
  }
  const territoryPhrase = info.territoryName
    ? ` for <strong>${escapeHtml(info.territoryName)}</strong>`
    : "";
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.dealerEmail,
      subject: "Welcome to LocalSpot — set up your dealer account",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#7B1418;">Welcome, ${escapeHtml(info.dealerName)}!</h2>
          <p>Your LocalSpot dealer account${territoryPhrase} is now active. Your payment was successful and your territory is reserved.</p>
          <p>Click the button below to set your password and access your dealer dashboard. This link expires in <strong>72 hours</strong>.</p>
          <p>
            <a href="${info.setPasswordLink}"
               style="display:inline-block;background:#7B1418;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;">
              Set my password →
            </a>
          </p>
          <p style="color:#666;font-size:13px;">
            Once your password is set, you can log in any time at
            <a href="${info.loginLink}" style="color:#7B1418;">your dealer portal</a>.
          </p>
          <p style="color:#999;font-size:12px;">
            Or paste this link in your browser:<br/>
            <a href="${info.setPasswordLink}" style="color:#7B1418;">${info.setPasswordLink}</a>
          </p>
        </div>
      `,
    });
    logger.info({ dealer: info.dealerEmail }, "Dealer welcome email sent");
  } catch (err) {
    logger.error({ err, dealer: info.dealerEmail }, "Failed to send dealer welcome email");
  }
}

export async function sendDealerPasswordResetEmail(
  info: DealerPasswordResetEmailInfo
): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.info(
      { dealer: info.dealerEmail },
      "Password reset email skipped — RESEND_API_KEY not set"
    );
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: info.dealerEmail,
      subject: "Reset your My Town Postcard dealer password",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Hi ${escapeHtml(info.dealerName)},</h2>
          <p>We received a request to reset your dealer portal password.</p>
          <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <p>
            <a href="${info.resetLink}"
               style="display:inline-block;background:#7B1418;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;">
              Reset my password →
            </a>
          </p>
          <p style="color:#666;font-size:13px;">
            If you didn't request a password reset, you can safely ignore this email.
            Your password will not change.
          </p>
          <p style="color:#999;font-size:12px;">
            Or paste this link in your browser:<br/>
            <a href="${info.resetLink}" style="color:#7B1418;">${info.resetLink}</a>
          </p>
        </div>
      `,
    });
    logger.info({ dealer: info.dealerEmail }, "Dealer password reset email sent");
  } catch (err) {
    logger.error({ err, dealer: info.dealerEmail }, "Failed to send dealer password reset email");
  }
}
