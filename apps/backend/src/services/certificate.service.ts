import { logOrderStatus } from '../utils/orderHistory';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import { execSync } from 'child_process';

// ─── Helpers ──────────────────────────────────────────

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

// ─── Get Products ─────────────────────────────────────

export const getProducts = async () => {
  const products = await prisma.certificateProduct.findMany({
    where: { isActive: true },
    include: { prices: { where: { isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return products;
};

export const getProductById = async (productId: string) => {
  const product = await prisma.certificateProduct.findUnique({
    where: { id: productId },
    include: { prices: { where: { isActive: true } } },
  });
  if (!product) throw new NotFoundError('Certificate product not found.');
  return product;
};

// ─── CSR Decoder ─────────────────────────────────────

export const decodeCSR = async (csr: string) => {
  // Clean up CSR
  const cleanCsr = csr.trim();
  if (!cleanCsr.includes('BEGIN CERTIFICATE REQUEST') && !cleanCsr.includes('BEGIN NEW CERTIFICATE REQUEST')) {
    throw new BadRequestError('Invalid CSR format. Please provide a valid PEM-encoded CSR.');
  }

  try {
    // Try to decode using OpenSSL if available
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmpFile = path.join(os.tmpdir(), `csr_${Date.now()}.pem`);
    fs.writeFileSync(tmpFile, cleanCsr);

    let decoded: any = {};
    try {
      const output = execSync(`openssl req -in ${tmpFile} -noout -text 2>/dev/null`, {
        timeout: 5000,
        encoding: 'utf8',
      });

      // Parse Subject
      const subjectMatch = output.match(/Subject:\s*(.+)/);
      if (subjectMatch) {
        const subject = subjectMatch[1];
        decoded.commonName = subject.match(/CN\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.organization = subject.match(/O\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.organizationalUnit = subject.match(/OU\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.country = subject.match(/C\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.state = subject.match(/ST\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.locality = subject.match(/L\s*=\s*([^,\n]+)/)?.[1]?.trim();
        decoded.email = subject.match(/emailAddress\s*=\s*([^,\n]+)/)?.[1]?.trim();
      }

      // Parse SANs
      const sanMatch = output.match(/DNS:([^\n,]+)/g);
      if (sanMatch) {
        decoded.sans = sanMatch.map((s: string) => s.replace('DNS:', '').trim());
      }

      // Parse key info
      const keyMatch = output.match(/Public Key Algorithm:\s*(.+)/);
      if (keyMatch) decoded.keyAlgorithm = keyMatch[1].trim();

      const keySizeMatch = output.match(/RSA Public-Key:\s*\((\d+)/);
      if (keySizeMatch) decoded.keySize = parseInt(keySizeMatch[1]);

    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }

    return decoded;
  } catch (error) {
    logger.warn('OpenSSL CSR decode failed, returning empty decoded:', error);
    // Return empty fields if OpenSSL not available
    return {
      commonName: '',
      organization: '',
      organizationalUnit: '',
      country: '',
      state: '',
      locality: '',
      email: '',
      sans: [],
      keyAlgorithm: 'RSA',
      keySize: 2048,
    };
  }
};

// ─── Create Order ─────────────────────────────────────

export const createOrder = async (
  userId: string,
  data: {
    productId: string;
    validity: string;
    csr: string;
    commonName: string;
    orgName?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    email?: string;
    sans?: string[];
    organizationId?: string;
  }
) => {
  // Get product and price
  const product = await prisma.certificateProduct.findUnique({
    where: { id: data.productId },
    include: { prices: true },
  });
  if (!product) throw new NotFoundError('Certificate product not found.');
  if (!product.isActive) throw new BadRequestError('This product is no longer available.');

  const priceRecord = product.prices.find((p) => p.validity === data.validity && p.isActive);
  if (!priceRecord) throw new NotFoundError('Pricing not found for selected validity period.');

  // Check wallet balance
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found.');
  if (Number(wallet.balanceNgn) < Number(priceRecord.priceNgn)) {
    throw new BadRequestError(
      `Insufficient wallet balance. Required: ₦${Number(priceRecord.priceNgn).toLocaleString()}, Available: ₦${Number(wallet.balanceNgn).toLocaleString()}`
    );
  }

  // Validate CSR
  if (!data.csr || !data.commonName) {
    throw new BadRequestError('CSR and Common Name are required.');
  }

  const orderNumber = generateOrderNumber();
  const reference = `CERT-PUR-${Date.now()}`;

  // Create order + deduct wallet atomically
  const result = await prisma.$transaction(async (tx) => {
    // Create the order
    const order = await tx.certificateOrder.create({
      data: {
        orderNumber,
        userId,
        productId: data.productId,
        organizationId: data.organizationId,
        status: 'PAID',
        validity: data.validity as any,
        priceNgn: priceRecord.priceNgn,
        csr: data.csr,
        commonName: data.commonName,
        orgName: data.orgName,
        organizationalUnit: data.organizationalUnit,
        country: data.country,
        state: data.state,
        locality: data.locality,
        email: data.email,
        sans: data.sans || [],
      },
      include: { product: true },
    });

    // Deduct wallet
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { balanceNgn: { decrement: priceRecord.priceNgn } },
    });

    // Record transaction
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        orderId: order.id,
        type: 'CERTIFICATE_PURCHASE',
        amountNgn: priceRecord.priceNgn,
        balanceBefore: wallet.balanceNgn,
        balanceAfter: updatedWallet.balanceNgn,
        description: `Certificate purchase: ${product.name} (${data.commonName})`,
        reference,
      },
    });

    return order;
  });

  // Send notification
  await prisma.notification.create({
    data: {
      userId,
      type: 'ORDER_UPDATE',
      channel: 'IN_APP',
      title: 'Order Placed Successfully',
      message: `Your order for ${product.name} (${data.commonName}) has been placed. Order #${orderNumber}`,
      metadata: { orderId: result.id, orderNumber },
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'ORDER_CREATED',
      resourceId: result.id,
      metadata: { orderNumber, product: product.name, amount: priceRecord.priceNgn },
    },
  });

  // Log initial status
  await logOrderStatus(result.id, null, 'PAID', {
    reason: 'Order placed and payment deducted from wallet',
    changedBy: userId,
  });

  logger.info(`Order created: ${orderNumber} for user ${userId}`);

  return result;
};

// ─── Get Orders ───────────────────────────────────────

export const getOrders = async (
  userId: string,
  filters: {
    page?: number;
    limit?: number;
    status?: string;
    productType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
) => {
  const page = filters.page || 1;
  const limit = filters.limit || 10;

  const where: any = { userId };

  if (filters.status) {
    if (filters.status === 'pending') {
      where.status = { in: ['PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE'] };
    } else {
      where.status = filters.status;
    }
  }
  if (filters.productType) {
    where.product = { type: filters.productType };
  }
  if (filters.search) {
    where.OR = [
      { commonName: { contains: filters.search, mode: 'insensitive' } },
      { orderNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [orders, total] = await Promise.all([
    prisma.certificateOrder.findMany({
      where,
      include: {
        product: true,
        certificate: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.certificateOrder.count({ where }),
  ]);

  return {
    orders,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ─── Get Order By ID ──────────────────────────────────

export const getOrderById = async (orderId: string, userId: string) => {
  const order = await prisma.certificateOrder.findFirst({
    where: { id: orderId, userId },
    include: {
      product: { include: { prices: true } },
      certificate: true,
      domainValidations: true,
      transaction: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found.');
  return order;
};

// ─── Cancel Order ─────────────────────────────────────

export const cancelOrder = async (orderId: string, userId: string) => {
  const order = await prisma.certificateOrder.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) throw new NotFoundError('Order not found.');
  if (!['PENDING_PAYMENT', 'PAID', 'PENDING_VALIDATION'].includes(order.status)) {
    throw new BadRequestError('This order cannot be cancelled at its current stage.');
  }

  // Refund wallet if already paid
  if (order.status !== 'PENDING_PAYMENT') {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (wallet) {
      const refundRef = `REFUND-${Date.now()}`;
      await prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.wallet.update({
          where: { userId },
          data: { balanceNgn: { increment: order.priceNgn } },
        });
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amountNgn: order.priceNgn,
            balanceBefore: wallet.balanceNgn,
            balanceAfter: updatedWallet.balanceNgn,
            description: `Refund for cancelled order #${order.orderNumber}`,
            reference: refundRef,
          },
        });
        await tx.certificateOrder.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      });
    }
  } else {
    await prisma.certificateOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  // Log CANCELLED status
  await logOrderStatus(orderId, order.status as any, 'CANCELLED', {
    reason: order.status === 'PENDING_PAYMENT' ? 'Cancelled before payment' : 'Cancelled by user — refund issued',
    changedBy: userId,
  });

  // Send cancellation email
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
  if (owner) Email.sendOrderCancelledEmail(owner.email, owner.firstName, order.commonName || '', order.orderNumber);

  return { message: 'Order cancelled successfully.' };
};
