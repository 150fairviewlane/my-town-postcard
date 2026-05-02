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
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@mytownpostcard.com";
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
