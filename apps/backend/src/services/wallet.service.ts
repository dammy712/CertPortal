import { prisma } from '../utils/prisma';
import { AppError, BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import crypto from 'crypto';
import { getInvoiceSettings } from './settings.service';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackHeaders = () => ({
  Authorization: `Bearer ${PAYSTACK_SECRET}`,
  'Content-Type': 'application/json',
});

const generateReference = () =>
  `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

export const getWallet = async (userId: string) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!wallet) throw new NotFoundError('Wallet not found.');
  return wallet;
};

export const getTransactions = async (userId: string, page = 1, limit = 20, type?: string) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found.');

  const where: any = { walletId: wallet.id };
  if (type) where.type = type;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const initializePayment = async (userId: string, amountNgn: number) => {
  if (amountNgn < 100) throw new BadRequestError('Minimum funding amount is ₦100.');
  if (amountNgn > 10_000_000) throw new BadRequestError('Maximum funding amount is ₦10,000,000.');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user) throw new NotFoundError('User not found.');

  const reference = generateReference();
  const amountKobo = Math.round(amountNgn * 100);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found.');

  await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      type: 'WALLET_FUNDING',
      amountNgn,
      balanceBefore: wallet.balanceNgn,
      balanceAfter: wallet.balanceNgn,
      description: `Wallet funding - ₦${amountNgn.toLocaleString()}`,
      reference,
      paystackStatus: 'pending',
    },
  });

  if (PAYSTACK_SECRET) {
    try {
      const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: paystackHeaders(),
        body: JSON.stringify({
          email: user.email,
          amount: amountKobo,
          reference,
          callback_url: `${process.env.FRONTEND_URL}/wallet?status=success&ref=${reference}`,
          metadata: {
            userId,
            walletId: wallet.id,
            custom_fields: [
              { display_name: 'Full Name', variable_name: 'full_name', value: `${user.firstName} ${user.lastName}` },
            ],
          },
        }),
      });
      const data = await response.json();
      if (data.status) {
        return {
          reference,
          authorizationUrl: data.data.authorization_url,
          accessCode: data.data.access_code,
          amount: amountNgn,
        };
      }
    } catch (error) {
      logger.error('Paystack initialization error:', error);
    }
  }

  return {
    reference,
    authorizationUrl: null,
    accessCode: `dev_${reference}`,
    amount: amountNgn,
    devMode: true,
  };
};

export const verifyPayment = async (reference: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { reference },
    include: { wallet: true },
  });

  if (!transaction) throw new NotFoundError('Transaction not found.');
  if (transaction.paystackStatus === 'success') {
    return { message: 'Payment already processed.', transaction };
  }

  let paymentSuccess = false;
  let gatewayResponse = '';

  if (PAYSTACK_SECRET) {
    try {
      const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
        headers: paystackHeaders(),
      });
      const data = await response.json();
      if (data.status && data.data.status === 'success') {
        paymentSuccess = true;
        gatewayResponse = data.data.gateway_response;
      }
    } catch (error) {
      logger.error('Paystack verify error:', error);
      throw new AppError('Payment verification failed. Please try again.');
    }
  } else {
    paymentSuccess = true;
    gatewayResponse = 'Development mode - auto approved';
  }

  if (!paymentSuccess) {
    await prisma.transaction.update({
      where: { reference },
      data: { paystackStatus: 'failed', gatewayResponse },
    });
    throw new BadRequestError('Payment was not successful.');
  }

  const updatedWallet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { id: transaction.walletId },
      data: { balanceNgn: { increment: transaction.amountNgn } },
    });
    await tx.transaction.update({
      where: { reference },
      data: { paystackStatus: 'success', gatewayResponse, balanceAfter: wallet.balanceNgn },
    });
    return wallet;
  });

  await prisma.notification.create({
    data: {
      userId: transaction.wallet.userId,
      type: 'WALLET_FUNDED',
      channel: 'IN_APP',
      title: 'Wallet Funded',
      message: `₦${Number(transaction.amountNgn).toLocaleString()} has been added to your wallet.`,
      metadata: { reference, amount: transaction.amountNgn },
    },
  });

  // Send wallet funded email
  const walletOwner = await prisma.user.findUnique({ where: { id: transaction.wallet.userId }, select: { email: true, firstName: true } });
  if (walletOwner) {
    Email.sendWalletFundedEmail(
      walletOwner.email,
      walletOwner.firstName,
      Number(transaction.amountNgn),
      Number(updatedWallet.balanceNgn)
    );
  }

  return {
    message: 'Payment verified and wallet credited.',
    newBalance: updatedWallet.balanceNgn,
    amount: transaction.amountNgn,
  };
};

export const handleWebhook = async (payload: string, signature: string) => {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || '';
  if (webhookSecret) {
    const hash = crypto.createHmac('sha512', webhookSecret).update(payload).digest('hex');
    if (hash !== signature) throw new BadRequestError('Invalid webhook signature.');
  }

  const event = JSON.parse(payload);
  logger.info(`Paystack webhook: ${event.event}`);

  if (event.event === 'charge.success') {
    try {
      await verifyPayment(event.data.reference);
    } catch (error) {
      logger.error(`Webhook error for ${event.data.reference}:`, error);
    }
  }

  return { received: true };
};

export const adminAdjustWallet = async (
  adminId: string,
  targetUserId: string,
  amountNgn: number,
  description: string
) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: targetUserId } });
  if (!wallet) throw new NotFoundError('Wallet not found.');

  const newBalance = Number(wallet.balanceNgn) + amountNgn;
  if (newBalance < 0) throw new BadRequestError('Adjustment would result in negative balance.');

  const reference = generateReference();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { userId: targetUserId },
      data: { balanceNgn: newBalance },
    });
    const transaction = await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'ADMIN_ADJUSTMENT',
        amountNgn: Math.abs(amountNgn),
        balanceBefore: wallet.balanceNgn,
        balanceAfter: newBalance,
        description,
        reference,
      },
    });
    return { wallet: updated, transaction };
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'WALLET_ADJUSTED',
      resourceId: targetUserId,
      metadata: { amountNgn, description, reference },
    },
  });

  return result;
};

// ─── Module 21: Invoice & Statement ──────────────────

export const getTransactionInvoice = async (userId: string, transactionId: string): Promise<string> => {
  const [tx, settings] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: transactionId, wallet: { userId } },
      include: {
        wallet: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        order:  { select: { orderNumber: true, commonName: true, validity: true, priceNgn: true } },
      },
    }),
    getInvoiceSettings(),
  ]);
  if (!tx) throw new NotFoundError('Transaction not found.');

  const user     = tx.wallet.user;
  const accent   = settings.accentColor || '#0ea5e9';
  const sym      = settings.currencySymbol || '₦';
  const fmt      = (n: any) => `${sym}${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const fmtDate  = (d: Date | string) => new Date(d).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTime  = (d: Date | string) => new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

  const typeLabel: Record<string, string> = {
    WALLET_FUNDING:       'Wallet Funding',
    CERTIFICATE_PURCHASE: 'Certificate Purchase',
    REFUND:               'Refund',
    ADMIN_CREDIT:         'Admin Credit',
    ADMIN_DEBIT:          'Admin Debit',
  };

  const isCredit   = ['WALLET_FUNDING', 'REFUND', 'ADMIN_CREDIT'].includes(tx.type);
  const amount     = Number(tx.amountNgn);
  const subtotal   = amount;
  const taxAmount  = settings.taxRate > 0 ? +(subtotal * settings.taxRate / 100).toFixed(2) : 0;
  const total      = subtotal + taxAmount;

  // Invoice number: prefix + last 8 chars of ID uppercased
  const invoiceNum = `${settings.invoicePrefix}${tx.id.slice(-8).toUpperCase()}`;

  // Due date calculation
  const invoiceDate = new Date(tx.createdAt);
  const dueDate     = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + (settings.dueDays || 0));

  // Item description
  const itemDesc = tx.order
    ? `SSL/TLS Certificate — ${tx.order.commonName || ''} (${(tx.order.validity || '').replace(/_/g,' ')})`
    : (tx.description || typeLabel[tx.type] || tx.type);

  const logoHtml = settings.companyLogo
    ? `<img src="${settings.companyLogo}" alt="Logo" style="max-height:60px;max-width:180px;object-fit:contain;" />`
    : `<div style="width:48px;height:48px;background:${accent};border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:900;">${(settings.companyName || 'C')[0]}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${invoiceNum} — ${settings.companyName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#111827;background:#fff;font-size:14px;line-height:1.5}
    .page{max-width:760px;margin:0 auto;padding:48px 48px 72px}

    /* ── Header ── */
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px}
    .company-info{flex:1}
    .company-name{font-size:18px;font-weight:700;color:#111827;margin-top:10px}
    .company-detail{font-size:12px;color:#6b7280;line-height:1.8;margin-top:4px}
    .invoice-badge{text-align:right}
    .invoice-badge h1{font-size:36px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:${accent}}
    .invoice-badge .inv-num{font-size:13px;color:#374151;font-weight:600;margin-top:4px}
    .invoice-badge .inv-date{font-size:12px;color:#6b7280;margin-top:2px}

    /* ── Meta grid ── */
    .meta-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:36px}
    .meta-item .meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:4px}
    .meta-item .meta-value{font-size:13px;font-weight:600;color:#111827}
    .meta-item .meta-sub{font-size:11px;color:#6b7280;margin-top:1px}

    /* ── Bill to / from ── */
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:36px}
    .party-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px}
    .party-name{font-size:15px;font-weight:700;color:#111827}
    .party-detail{font-size:12px;color:#6b7280;line-height:1.8;margin-top:2px}

    /* ── Line items table ── */
    .items-table{width:100%;border-collapse:collapse;margin-bottom:24px}
    .items-table thead tr{background:${accent};color:#fff}
    .items-table thead th{padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;text-align:left}
    .items-table thead th.right{text-align:right}
    .items-table tbody tr{border-bottom:1px solid #f3f4f6}
    .items-table tbody tr:hover{background:#fafafa}
    .items-table tbody td{padding:14px;font-size:13px;color:#374151;vertical-align:top}
    .items-table tbody td.right{text-align:right;font-weight:500}
    .items-table tbody td.mono{font-family:'Courier New',monospace;font-size:12px;color:#6b7280}
    .item-desc{font-weight:600;color:#111827}
    .item-sub{font-size:11px;color:#6b7280;margin-top:2px}

    /* ── Totals ── */
    .totals{display:flex;justify-content:flex-end;margin-bottom:36px}
    .totals-box{width:280px}
    .total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6}
    .total-row.tax{font-size:12px;color:#6b7280}
    .total-row.grand{border-top:2px solid ${accent};border-bottom:none;padding-top:10px;margin-top:4px;font-size:16px;font-weight:800;color:#111827}
    .total-row.balance{font-size:13px;font-weight:700;color:${isCredit ? '#15803d' : '#b91c1c'};padding-top:6px;border-bottom:none}
    .paid-stamp{display:inline-block;border:2px solid #15803d;color:#15803d;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;padding:3px 10px;border-radius:4px;transform:rotate(-3deg);margin-top:8px}

    /* ── Payment info ── */
    .payment-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 20px;margin-bottom:32px}
    .payment-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${accent};margin-bottom:8px}
    .payment-detail{font-size:12px;color:#374151;line-height:1.8}

    /* ── Footer ── */
    .footer{border-top:1px solid #e5e7eb;padding-top:20px;font-size:11px;color:#9ca3af;text-align:center;line-height:1.9}
    .footer a{color:${accent};text-decoration:none}

    /* ── Print ── */
    @media print{
      body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .no-print{display:none!important}
    }
    .print-btn{position:fixed;bottom:24px;right:24px;background:${accent};color:#fff;border:none;padding:12px 22px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:100}
    .print-btn:hover{opacity:.9}
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <div class="page">

    <!-- ══ HEADER ══ -->
    <div class="header">
      <div class="company-info">
        ${logoHtml}
        <div class="company-name">${settings.companyName}</div>
        <div class="company-detail">
          ${settings.companyAddress}<br/>
          ${settings.companyCity}${settings.companyState ? ', ' + settings.companyState : ''}, ${settings.companyCountry}<br/>
          ${settings.companyPhone ? settings.companyPhone + '<br/>' : ''}
          ${settings.companyEmail}${settings.companyWebsite ? ' · ' + settings.companyWebsite : ''}
        </div>
      </div>
      <div class="invoice-badge">
        <h1>Invoice</h1>
        <div class="inv-num">${invoiceNum}</div>
        <div class="inv-date">Issued: ${fmtDate(invoiceDate)} at ${fmtTime(invoiceDate)}</div>
      </div>
    </div>

    <!-- ══ META ROW ══ -->
    <div class="meta-row">
      <div class="meta-item">
        <div class="meta-label">Invoice Date</div>
        <div class="meta-value">${fmtDate(invoiceDate)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Due Date</div>
        <div class="meta-value">${settings.dueDays === 0 ? 'Upon Receipt' : fmtDate(dueDate)}</div>
        <div class="meta-sub">${settings.paymentTerms}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Status</div>
        <div class="meta-value" style="color:${isCredit ? '#15803d' : '#b91c1c'}">${isCredit ? '✓ Paid / Credited' : '✓ Charged'}</div>
        <div class="meta-sub">${tx.paystackRef ? 'Ref: ' + tx.paystackRef : 'Ref: ' + (tx.reference || tx.id.slice(0,8).toUpperCase())}</div>
      </div>
    </div>

    <!-- ══ BILL TO / FROM ══ -->
    <div class="parties">
      <div>
        <div class="party-label">Billed To</div>
        <div class="party-name">${user.firstName} ${user.lastName}</div>
        <div class="party-detail">${user.email}${tx.order ? '<br/>Order: ' + tx.order.orderNumber : ''}</div>
      </div>
      <div>
        <div class="party-label">From</div>
        <div class="party-name">${settings.companyName}</div>
        <div class="party-detail">${settings.companyEmail}<br/>${settings.companyAddress}, ${settings.companyCity}</div>
      </div>
    </div>

    <!-- ══ LINE ITEMS ══ -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:50%">Description</th>
          <th class="right" style="width:16%">Unit Cost</th>
          <th class="right" style="width:10%">Qty</th>
          <th class="right" style="width:24%">Line Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-desc">${itemDesc}</div>
            ${tx.order ? '<div class="item-sub">Order: ' + tx.order.orderNumber + '</div>' : ''}
          </td>
          <td class="right">${fmt(subtotal)}</td>
          <td class="right">1</td>
          <td class="right">${fmt(subtotal)}</td>
        </tr>
      </tbody>
    </table>

    <!-- ══ TOTALS ══ -->
    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${settings.taxRate > 0 ? `<div class="total-row tax"><span>${settings.taxLabel} (${settings.taxRate}%)</span><span>${fmt(taxAmount)}</span></div>` : ''}
        <div class="total-row grand"><span>Invoice Total</span><span>${fmt(total)}</span></div>
        <div class="total-row balance"><span>Balance Due</span><span>${isCredit ? fmt(0) : fmt(total)}</span></div>
        ${isCredit ? '<div style="text-align:right;margin-top:8px"><span class="paid-stamp">Paid</span></div>' : ''}
      </div>
    </div>

    <!-- ══ PAYMENT INFO ══ -->
    ${(settings.bankName || settings.bankAccount) ? `
    <div class="payment-box">
      <div class="payment-title">Payment Information</div>
      <div class="payment-detail">
        ${settings.bankName ? 'Bank: ' + settings.bankName + '<br/>' : ''}
        ${settings.bankAccount ? 'Account: ' + settings.bankAccount + '<br/>' : ''}
        ${settings.bankSort ? 'Sort Code: ' + settings.bankSort : ''}
      </div>
    </div>` : ''}

    <!-- ══ FOOTER ══ -->
    <div class="footer">
      <p>${settings.footerNote}</p>
      <p style="margin-top:6px">Invoice ID: ${tx.id} · Generated ${fmtDate(new Date())} ${fmtTime(new Date())}</p>
      ${settings.companyWebsite ? `<p><a href="${settings.companyWebsite}">${settings.companyWebsite}</a></p>` : ''}
    </div>

  </div>
</body>
</html>`;
};


export const getStatement = async (
  userId: string,
  params: { from?: string; to?: string; page?: number; limit?: number; format?: string }
) => {
  const { from, to, page = 1, limit = 50, format } = params;
  const where: any = { wallet: { userId } };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to + 'T23:59:59Z');
  }

  const [transactions, total, wallet] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { order: { select: { orderNumber: true, commonName: true } } },
    }),
    prisma.transaction.count({ where }),
    prisma.wallet.findUnique({ where: { userId }, select: { balanceNgn: true } }),
  ]);

  if (format === 'csv') {
    const header = 'Date,Type,Description,Reference,Amount (NGN),Balance Before,Balance After,Order';
    const rows = transactions.map(tx => [
      new Date(tx.createdAt).toISOString(),
      tx.type,
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      tx.reference || tx.id,
      Number(tx.amountNgn).toFixed(2),
      Number(tx.balanceBefore).toFixed(2),
      Number(tx.balanceAfter).toFixed(2),
      tx.order?.orderNumber || '',
    ].join(','));
    return { csv: [header, ...rows].join('\n'), total };
  }

  return {
    transactions,
    balance: wallet?.balanceNgn,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};
