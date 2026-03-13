import { logger } from './logger';

// Lazy-load nodemailer so the server starts even if it's not yet installed.
// It will be available after docker-compose up --build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getMailer = () => {
  try { return require('nodemailer'); }
  catch { return null; }
};

// ─── Transport ────────────────────────────────────────

const getTransporter = () => {
  const nodemailer = getMailer();
  if (!nodemailer) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
};

const FROM = process.env.EMAIL_FROM || 'CertPortal <noreply@certportal.com>';
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Base HTML template ───────────────────────────────

const wrap = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:28px 40px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🔐 CertPortal</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;color:#1f2937;line-height:1.6;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ${new Date().getFullYear()} CertPortal. This is an automated message — please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (text: string, url: string) =>
  `<a href="${url}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${text}</a>`;

// ─── Send helper ──────────────────────────────────────

const send = async (to: string, subject: string, html: string) => {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn(`[Email] nodemailer not installed — skipping email to ${to}. Run docker-compose up --build.`);
    return;
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn(`[Email] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    logger.info(`[Email] Sent "${subject}" to ${to}`);
  } catch (err) {
    logger.error(`[Email] Failed to send to ${to}:`, err);
    // Never throw — email failure must not break the main flow
  }
};

// ─── Email templates ──────────────────────────────────

export const sendWelcomeEmail = (to: string, firstName: string) =>
  send(to, 'Welcome to CertPortal 🎉', wrap('Welcome', `
    <h2 style="margin:0 0 12px;font-size:20px;">Welcome, ${firstName}!</h2>
    <p>Your CertPortal account is ready. You can now order and manage SSL/TLS certificates from one place.</p>
    ${btn('Go to Dashboard', `${BASE_URL}/dashboard`)}
    <p style="font-size:13px;color:#6b7280;">Need help? Reply to any support email or visit our help centre.</p>
  `));

export const sendCertificateIssuedEmail = (to: string, firstName: string, commonName: string, expiresAt: Date, orderId: string) =>
  send(to, `Your certificate for ${commonName} is ready`, wrap('Certificate Issued', `
    <h2 style="margin:0 0 12px;font-size:20px;">Your certificate is ready! 🎉</h2>
    <p>Hi ${firstName}, your SSL/TLS certificate has been issued successfully.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Domain</td><td style="padding:8px 0;font-weight:600;">${commonName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Expires</td><td style="padding:8px 0;font-weight:600;">${expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
    </table>
    ${btn('Download Certificate', `${BASE_URL}/orders/${orderId}`)}
    <p style="font-size:13px;color:#6b7280;">We'll remind you before it expires so you never miss a renewal.</p>
  `));

export const sendExpiryWarningEmail = (
  to: string,
  firstName: string,
  commonName: string,
  daysLeft: number,
  expiresAt: Date,
  orderId?: string
) => {
  const isCritical = daysLeft <= 7;
  const isWarning  = daysLeft <= 30;
  const color      = isCritical ? '#dc2626' : isWarning ? '#d97706' : '#2563eb';
  const emoji      = isCritical ? '🚨' : isWarning ? '⚠️' : '📅';
  const subject    = isCritical
    ? `🚨 URGENT: ${commonName} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — Renew Now`
    : `${emoji} ${commonName} expires in ${daysLeft} days`;

  const renewUrl = `${BASE_URL}/orders/new`;

  const urgencyBanner = isCritical
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0;color:#991b1b;font-size:14px;font-weight:600;">⚠️ Immediate action required</p>
        <p style="margin:4px 0 0;color:#b91c1c;font-size:13px;">Your certificate will expire in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Visitors will see security warnings if not renewed.</p>
       </div>`
    : `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">${emoji} Renewal reminder</p>
        <p style="margin:4px 0 0;color:#b45309;font-size:13px;">Plan your renewal early to avoid any last-minute issues.</p>
       </div>`;

  return send(to, subject, wrap('Certificate Expiry Reminder', `
    <h2 style="margin:0 0 16px;font-size:20px;color:${color};">${emoji} Certificate Expiring Soon</h2>
    <p style="margin:0 0 20px;">Hi ${firstName}, your SSL/TLS certificate needs attention.</p>
    ${urgencyBanner}
    <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;width:40%;">Domain</td>
        <td style="padding:12px 16px;font-weight:600;font-size:14px;">${commonName}</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Expiry Date</td>
        <td style="padding:12px 16px;font-weight:600;font-size:14px;color:${color};">${expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Days Remaining</td>
        <td style="padding:12px 16px;font-weight:700;font-size:16px;color:${color};">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</td>
      </tr>
    </table>
    ${btn('🔄 Renew Certificate Now', renewUrl)}
    <p style="font-size:13px;color:#6b7280;margin-top:16px;">
      Renewing before expiry ensures zero downtime for your website visitors and maintains your security posture.
      ${orderId ? `<br><br>You can also view the original order <a href="${BASE_URL}/orders/${orderId}" style="color:#4f46e5;">here</a>.` : ''}
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:12px;color:#9ca3af;">
      You're receiving this because you have an active certificate on CertPortal. 
      These reminders are sent at 90, 60, 30, and 7 days before expiry.
    </p>
  `));
};

export const sendOrderCancelledEmail = (to: string, firstName: string, commonName: string, orderNumber: string) =>
  send(to, `Order ${orderNumber} cancelled`, wrap('Order Cancelled', `
    <h2 style="margin:0 0 12px;font-size:20px;">Order Cancelled</h2>
    <p>Hi ${firstName}, your certificate order for <strong>${commonName}</strong> (${orderNumber}) has been cancelled.</p>
    <p>If you cancelled by mistake or need a new certificate, you can place a new order at any time.</p>
    ${btn('Place New Order', `${BASE_URL}/orders/new`)}
  `));

export const sendKycApprovedEmail = (to: string, firstName: string) =>
  send(to, 'KYC Verification Approved ✅', wrap('KYC Approved', `
    <h2 style="margin:0 0 12px;font-size:20px;">Identity Verified! ✅</h2>
    <p>Hi ${firstName}, your identity verification (KYC) has been approved.</p>
    <p>You can now order OV and EV certificates which require identity verification.</p>
    ${btn('Browse Certificates', `${BASE_URL}/products`)}
  `));

export const sendKycRejectedEmail = (to: string, firstName: string, reason?: string) =>
  send(to, 'KYC Verification — Action Required', wrap('KYC Update Required', `
    <h2 style="margin:0 0 12px;font-size:20px;">Verification Update Required</h2>
    <p>Hi ${firstName}, unfortunately we were unable to verify your identity with the documents provided.</p>
    ${reason ? `<p style="padding:12px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>Please re-upload your documents with the correct information.</p>
    ${btn('Update KYC Documents', `${BASE_URL}/kyc`)}
  `));

export const sendWalletFundedEmail = (to: string, firstName: string, amount: number, balance: number) =>
  send(to, `Wallet funded: ₦${amount.toLocaleString('en-NG')}`, wrap('Wallet Funded', `
    <h2 style="margin:0 0 12px;font-size:20px;">Wallet Funded ✅</h2>
    <p>Hi ${firstName}, your CertPortal wallet has been credited successfully.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Amount Added</td><td style="padding:8px 0;font-weight:600;color:#16a34a;">+₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">New Balance</td><td style="padding:8px 0;font-weight:600;">₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td></tr>
    </table>
    ${btn('View Wallet', `${BASE_URL}/wallet`)}
  `));

export const sendPasswordResetEmail = (to: string, firstName: string, resetUrl: string) =>
  send(to, 'Reset your CertPortal password', wrap('Password Reset', `
    <h2 style="margin:0 0 12px;font-size:20px;">Reset Your Password</h2>
    <p>Hi ${firstName}, we received a request to reset your password.</p>
    ${btn('Reset Password', resetUrl)}
    <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `));

export const sendCertificateRevokedEmail = (to: string, firstName: string, commonName: string, reason: string) =>
  send(to, `Certificate for ${commonName} has been revoked`, wrap('Certificate Revoked', `
    <h2 style="margin:0 0 12px;font-size:20px;color:#dc2626;">Certificate Revoked</h2>
    <p>Hi ${firstName}, your SSL/TLS certificate for <strong>${commonName}</strong> has been revoked by an administrator.</p>
    <p style="padding:12px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;">
      <strong>Reason:</strong> ${reason}
    </p>
    <p>If you believe this was done in error, please contact our support team. Otherwise, you can order a replacement certificate.</p>
    ${btn('Order Replacement', `${BASE_URL}/orders/new`)}
  `));
