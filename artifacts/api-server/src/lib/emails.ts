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

export async function sendReservationConfirmation(order: OrderInfo): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: order.contactEmail,
      subject: `Your ${order.spotSize} ad spot is reserved — My Town Postcard`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <div style="background: #991b1b; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">📮 My Town Postcard</h1>
          </div>
          <div style="background: #fff; border: 1px solid #e5e7eb; padding: 32px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111; font-size: 22px; margin-top: 0;">Your Spot is Reserved!</h2>
            <p style="color: #374151;">Hi <strong>${order.businessName}</strong>,</p>
            <p style="color: #374151;">You've successfully reserved a <strong>${order.spotSize} ad spot</strong> on our Spring 2025 Clarkesville Co-op Postcard.</p>
            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="margin: 4px 0; color: #374151;"><strong>Spot Size:</strong> ${order.spotSize}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Price:</strong> $${(order.spotPrice / 100).toFixed(2)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Order #:</strong> ${order.orderId}</p>
            </div>
            <p style="color: #374151;">Next step: upload your ad or let us design it for you.</p>
            <a href="${APP_URL}/upload/${order.spotId}" style="display: inline-block; background: #991b1b; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; margin-top: 8px;">
              Upload Your Ad →
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">My Town Postcard · mytownpostcard.com · Habersham County, GA · Mailing to 5,000 homes</p>
          </div>
        </div>
      `,
    });
    logger.info({ orderId: order.orderId }, "Reservation confirmation email sent");
  } catch (err) {
    logger.error({ err, orderId: order.orderId }, "Failed to send reservation email");
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
