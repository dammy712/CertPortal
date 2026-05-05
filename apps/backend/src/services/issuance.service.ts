import { logOrderStatus } from '../utils/orderHistory';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { uploadFile, getSignedUrl } from '../utils/fileUpload';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import { resolveProvider } from './ca';

// ─── Poll CA for order status and store cert if issued ──
// This is the ONLY function the scheduler should call.
// It checks Certum, and if the cert is ready, downloads and stores it.

export const pollCAStatus = async (orderId: string): Promise<{ status: string; caRawStatus?: string }> => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { product: true, user: true },
  });

  if (!order) throw new NotFoundError('Order not found.');

  // Already issued — nothing to do
  if ((order.status as string) === 'ISSUED') return { status: 'issued' };

  if (!order.caOrderId) {
    return { status: 'pending', caRawStatus: 'no_ca_order_id' };
  }

  const provider = resolveProvider(order.caProvider || order.product.caProvider);
  logger.debug(`[CA Poll] Checking ${provider.name} order ${order.caOrderId} for ${order.orderNumber}`);

  const caStatus = await provider.getOrderStatus(order.caOrderId);

  // Update caStatus in DB for tracking
  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { caStatus: caStatus.caRawStatus || caStatus.status },
  });

  if (caStatus.status !== 'issued') {
    logger.debug(`[CA Poll] ${order.orderNumber}: CA status = ${caStatus.caRawStatus} (not yet issued)`);
    return { status: caStatus.status, caRawStatus: caStatus.caRawStatus };
  }

  // CA says ENROLLED — check for idempotency before creating cert
  const existing = await prisma.certificate.findUnique({ where: { orderId } });
  if (existing) {
    // Already stored — just make sure order status is ISSUED
    if ((order.status as string) !== 'ISSUED') {
      await prisma.certificateOrder.update({
        where: { id: orderId },
        data: { status: 'ISSUED' },
      });
    }
    logger.info(`[CA Poll] ${order.orderNumber}: cert already in DB, marking ISSUED`);
    return { status: 'issued' };
  }

  // Download the actual certificate from Certum
  logger.info(`[CA Poll] ${order.orderNumber}: ENROLLED — downloading certificate from Certum`);

  let download;
  try {
    download = await provider.downloadCertificate(order.caOrderId);
  } catch (err: any) {
    logger.warn(`[CA Poll] Failed to download cert for ${order.orderNumber}: ${err.message}`);
    return { status: 'processing', caRawStatus: 'download_failed' };
  }

  // Store the PEM files
  const certBuffer  = Buffer.from(download.certificatePem, 'utf8');
  const chainBuffer = Buffer.from(download.chainPem || download.certificatePem, 'utf8');

  const { key: certKey }  = await uploadFile(certBuffer,  `${order.orderNumber}.crt`,       'application/x-pem-file', `certificates/${order.userId}`);
  const { key: chainKey } = await uploadFile(chainBuffer, `${order.orderNumber}-chain.crt`, 'application/x-pem-file', `certificates/${order.userId}`);

  const certificate = await prisma.certificate.create({
    data: {
      orderId,
      serialNumber:   download.serialNumber || order.caOrderId,
      thumbprint:     download.serialNumber || '',
      commonName:     order.commonName || '',
      issuerName:     'Certum',
      subjectAltNames: order.sans || [],
      certFileKey:    certKey,
      chainFileKey:   chainKey,
      issuedAt:       download.issuedAt  || new Date(),
      expiresAt:      download.expiresAt || new Date(Date.now() + 199 * 24 * 60 * 60 * 1000),
    },
  });

  // Mark order as ISSUED
  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { status: 'ISSUED', caStatus: 'issued' },
  });

  await logOrderStatus(orderId, 'PENDING_ISSUANCE', 'ISSUED', {
    reason: 'Certificate downloaded from Certum CA',
    note:   `CA Order: ${order.caOrderId} | Serial: ${download.serialNumber}`,
    changedBy: 'system',
  });

  // Notify user
  await prisma.notification.create({
    data: {
      userId:  order.userId,
      type:    'CERT_ISSUED',
      channel: 'IN_APP',
      title:   '🎉 Your Certificate is Ready!',
      message: `Your SSL certificate for ${order.commonName} has been issued and is ready to download.`,
      metadata: { orderId, certificateId: certificate.id },
    },
  });

  const owner = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { email: true, firstName: true },
  });
  if (owner) {
    Email.sendCertificateIssuedEmail(owner.email, owner.firstName, order.commonName || '', certificate.expiresAt, orderId);
  }

  logger.info(`[CA Poll] Certificate stored for ${order.orderNumber}: serial ${download.serialNumber}`);
  return { status: 'issued' };
};

// ─── Issue Certificate (admin manual trigger) ─────────
// Only used by admin to manually force-check a specific order.
// Do NOT call this in a loop — use pollCAStatus instead.

export const issueCertificate = async (orderId: string, adminId?: string): Promise<any> => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { product: true },
  });
  if (!order) throw new NotFoundError('Order not found.');

  // Idempotency check — never issue twice
  const existing = await prisma.certificate.findUnique({ where: { orderId } });
  if (existing) {
    logger.warn(`issueCertificate called on already-issued order ${orderId} — returning existing cert`);
    return existing;
  }

  if (!order.caOrderId) {
    throw new BadRequestError('Order has not been submitted to the CA yet.');
  }

  // Delegate to pollCAStatus which handles everything correctly
  logger.info(`Admin-triggered cert download for order ${orderId}`);
  const result = await pollCAStatus(orderId);

  if (result.status !== 'issued') {
    throw new BadRequestError(`Certificate not ready yet — CA status: ${result.caRawStatus || result.status}`);
  }

  return prisma.certificate.findUnique({ where: { orderId } });
};

// ─── Get Certificate for Order ────────────────────────

export const getCertificate = async (orderId: string, userId: string) => {
  const order = await prisma.certificateOrder.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) throw new NotFoundError('Order not found.');

  const certificate = await prisma.certificate.findUnique({
    where: { orderId },
    include: {
      order: {
        select: {
          orderNumber: true,
          commonName: true,
          validity: true,
          product: { select: { name: true, type: true } },
        },
      },
    },
  });

  if (!certificate) throw new NotFoundError('Certificate not yet issued for this order.');
  return certificate;
};

// ─── Download Certificate File ────────────────────────

export const downloadCertificate = async (
  certificateId: string,
  userId: string,
  fileType: 'cert' | 'chain' | 'fullchain'
) => {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { order: true },
  });

  if (!certificate) throw new NotFoundError('Certificate not found.');
  if (certificate.order.userId !== userId) throw new ForbiddenError('Access denied.');

  let fileKey: string | null = null;
  if (fileType === 'cert')           fileKey = certificate.certFileKey;
  else if (fileType === 'chain')     fileKey = certificate.chainFileKey;
  else if (fileType === 'fullchain') fileKey = certificate.certFileKey; // fullchain = cert + chain combined

  if (!fileKey) throw new NotFoundError('File not available.');

  const url = await getSignedUrl(fileKey);

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CERT_DOWNLOADED',
      resourceId: certificateId,
      metadata: { fileType },
    },
  });

  return { url, fileName: `${certificate.commonName}-${fileType}.crt` };
};

// ─── List User's Certificates ─────────────────────────

export const listCertificates = async (
  userId: string,
  filters: {
    page?: number; limit?: number; status?: string; search?: string;
    productType?: string; expiryFrom?: string; expiryTo?: string;
    dateFrom?: string; dateTo?: string;
  } = {}
) => {
  const { page = 1, limit = 10, status, search, productType, expiryFrom, expiryTo, dateFrom, dateTo } = filters;
  const now = new Date();

  const orderWhere: any = { userId, status: 'ISSUED' };
  if (productType) orderWhere.product = { type: productType };

  const orders = await prisma.certificateOrder.findMany({
    where: orderWhere,
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const where: any = { orderId: { in: orderIds } };
  if (status === 'active')  { where.revokedAt = null; where.expiresAt = { gt: now }; }
  if (status === 'expired') where.expiresAt = { lte: now };
  if (status === 'revoked') where.revokedAt = { not: null };
  if (search) {
    where.OR = [
      { commonName:   { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (expiryFrom || expiryTo) {
    where.expiresAt = {};
    if (expiryFrom) where.expiresAt.gte = new Date(expiryFrom);
    if (expiryTo)   where.expiresAt.lte = new Date(expiryTo);
  }
  if (dateFrom || dateTo) {
    where.issuedAt = {};
    if (dateFrom) where.issuedAt.gte = new Date(dateFrom);
    if (dateTo)   where.issuedAt.lte = new Date(dateTo);
  }

  const [certificates, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      include: {
        order: {
          select: {
            orderNumber: true, validity: true,
            product: { select: { name: true, type: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.certificate.count({ where }),
  ]);

  return {
    certificates: certificates.map((c) => ({
      ...c,
      isExpired: c.expiresAt < now,
      daysUntilExpiry: Math.ceil((c.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ─── Admin: Manual issue trigger ─────────────────────

export const adminIssueCertificate = async (adminId: string, orderId: string) => {
  const order = await prisma.certificateOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found.');

  if (!['PENDING_ISSUANCE', 'PENDING_VALIDATION'].includes(order.status)) {
    throw new BadRequestError('Order cannot be issued in its current state.');
  }

  if (order.status !== 'PENDING_ISSUANCE') {
    await prisma.certificateOrder.update({
      where: { id: orderId },
      data: { status: 'PENDING_ISSUANCE' },
    });
  }

  return issueCertificate(orderId, adminId);
};