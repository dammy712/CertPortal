import { logOrderStatus } from '../utils/orderHistory';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { uploadFile, getSignedUrl } from '../utils/fileUpload';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import crypto from 'crypto';
import { resolveProvider } from './ca';
import type { CAOrderRequest, CACertificateDownload } from './ca';

// ─── Submit Order to CA ─────────────────────────────────

/**
 * Submit an order to the appropriate Certificate Authority.
 * Called when an order transitions to PENDING_ISSUANCE (after payment + validation).
 */
export const submitToCA = async (orderId: string) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: {
      product: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
      organization: true,
    },
  });

  if (!order) throw new NotFoundError('Order not found.');
  if (!['PENDING_ISSUANCE', 'PAID'].includes(order.status)) {
    throw new BadRequestError(`Order is not ready for CA submission. Current status: ${order.status}`);
  }

  const provider = resolveProvider(order.caProvider || order.product.caProvider);

  logger.info(`Submitting order ${orderId} to CA provider: ${provider.name}`);

  // Build the CA order request
  const caRequest: CAOrderRequest = {
    productCode: order.product.caProductCode || order.product.type,
    commonName: order.commonName || '',
    csr: order.csr || '',
    sans: order.sans || [],
    validity: order.validity,
    contact: {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.email || order.user.email,
      phone: order.user.phone || undefined,
    },
    customer: order.user.email, // Certum requires unique customer ID
  };

  // Add organization info for OV/EV certs
  if (order.organization) {
    caRequest.organization = {
      name: order.organization.name,
      country: order.organization.country || 'NG',
      state: order.organization.state || undefined,
      city: order.organization.city || undefined,
      address: order.organization.address || undefined,
      phone: order.organization.phone || undefined,
      registrationNo: order.organization.registrationNo || undefined,
    };
  }

  // Add validation method if we have domain validations
  const domainValidation = await prisma.domainValidation.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  if (domainValidation) {
    caRequest.validationMethod = domainValidation.method as any;
    caRequest.validationEmail = domainValidation.validationEmail || undefined;
  }

  try {
    const caResponse = await provider.submitOrder(caRequest);

    // Update order with CA reference
    await prisma.certificateOrder.update({
      where: { id: orderId },
      data: {
        caProvider: provider.name,
        caOrderId: caResponse.caOrderId,
        caStatus: caResponse.status,
        status: 'PENDING_ISSUANCE',
      },
    });

    await logOrderStatus(orderId, order.status as any, 'PENDING_ISSUANCE', {
      reason: `Submitted to ${provider.name} CA`,
      note: `CA Order ID: ${caResponse.caOrderId}`,
      changedBy: 'system',
    });

    logger.info(`Order ${orderId} submitted to ${provider.name}: CA order ${caResponse.caOrderId}`);

    return {
      caOrderId: caResponse.caOrderId,
      status: caResponse.status,
      approverEmails: caResponse.approverEmails,
      validationDetails: caResponse.validationDetails,
    };
  } catch (err: any) {
    logger.error(`CA submission failed for order ${orderId}: ${err.message}`);

    // Log the failure but don't change order status — allow retry
    await logOrderStatus(orderId, order.status as any, order.status as any, {
      reason: `CA submission failed: ${err.message}`,
      changedBy: 'system',
    });

    throw new BadRequestError(`Certificate Authority error: ${err.message}`);
  }
};

// ─── Poll CA for Order Status ───────────────────────────

/**
 * Check status of an order with the CA and update local state.
 * Called by the scheduler or manually by admin.
 */
export const pollCAStatus = async (orderId: string) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { product: true },
  });

  if (!order || !order.caOrderId) {
    throw new NotFoundError('Order not found or not yet submitted to CA.');
  }

  const provider = resolveProvider(order.caProvider || order.product.caProvider);
  const caStatus = await provider.getOrderStatus(order.caOrderId);

  // Update CA status
  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { caStatus: caStatus.caRawStatus },
  });

  // If CA says issued, pull the certificate
  if (caStatus.status === 'issued' && order.status !== 'ISSUED') {
    logger.info(`CA reports order ${orderId} as issued — downloading certificate`);
    await fetchAndStoreCertificate(orderId, order.caOrderId, provider.name);
  }

  // If CA says cancelled/rejected
  if (caStatus.status === 'cancelled' && order.status !== 'CANCELLED') {
    await prisma.certificateOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await logOrderStatus(orderId, order.status as any, 'CANCELLED', {
      reason: `Cancelled by CA (${caStatus.caRawStatus})`,
      changedBy: 'system',
    });
  }

  return caStatus;
};

// ─── Fetch & Store Issued Certificate ───────────────────

/**
 * Download the issued certificate from the CA and store it locally.
 */
const fetchAndStoreCertificate = async (
  orderId: string,
  caOrderId: string,
  caProviderName: string
) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (!order) return;

  const provider = resolveProvider(caProviderName);

  let certData: CACertificateDownload;
  try {
    certData = await provider.downloadCertificate(caOrderId);
  } catch (err: any) {
    logger.warn(`Certificate not yet available for order ${orderId}: ${err.message}`);
    return;
  }

  // Check if certificate already stored
  const existing = await prisma.certificate.findUnique({ where: { orderId } });
  if (existing) {
    logger.info(`Certificate already stored for order ${orderId}`);
    return existing;
  }

  // Store cert files
  const certBuffer = Buffer.from(certData.certificatePem, 'utf8');
  const chainBuffer = Buffer.from(certData.chainPem || '', 'utf8');

  const { key: certKey } = await uploadFile(
    certBuffer,
    `${order.orderNumber}.crt`,
    'application/x-pem-file',
    `certificates/${order.userId}`
  );
  const { key: chainKey } = await uploadFile(
    chainBuffer,
    `${order.orderNumber}-chain.crt`,
    'application/x-pem-file',
    `certificates/${order.userId}`
  );

  // Compute thumbprint if not provided
  const thumbprint = certData.thumbprint ||
    crypto.createHash('sha1').update(certBuffer).digest('hex').toUpperCase();

  // Save certificate record
  const certificate = await prisma.certificate.create({
    data: {
      orderId,
      serialNumber: certData.serialNumber,
      thumbprint,
      commonName: order.commonName || '',
      issuerName: `${caProviderName} CA`,
      subjectAltNames: order.sans || [],
      certFileKey: certKey,
      chainFileKey: chainKey,
      issuedAt: certData.issuedAt,
      expiresAt: certData.expiresAt,
    },
  });

  // Update order to ISSUED
  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: {
      status: 'ISSUED',
      caStatus: 'issued',
      issuedAt: certData.issuedAt,
      expiresAt: certData.expiresAt,
    },
  });

  await logOrderStatus(orderId, 'PENDING_ISSUANCE', 'ISSUED', {
    reason: `Certificate issued by ${caProviderName}`,
    note: `Serial: ${certificate.serialNumber || 'N/A'}`,
    changedBy: 'system',
  });

  // Notify user
  await prisma.notification.create({
    data: {
      userId: order.userId,
      type: 'CERT_ISSUED',
      channel: 'IN_APP',
      title: '🎉 Your Certificate is Ready!',
      message: `Your SSL certificate for ${order.commonName} has been issued and is ready to download.`,
      metadata: { orderId, certificateId: certificate.id },
    },
  });

  // Send email
  const owner = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { email: true, firstName: true },
  });
  if (owner) {
    Email.sendCertificateIssuedEmail(
      owner.email, owner.firstName,
      order.commonName || '', certificate.expiresAt, order.id
    ).catch(err => logger.warn(`Failed to send cert issued email: ${err.message}`));
  }

  logger.info(`Certificate stored: ${certificate.id} for ${order.commonName} (${caProviderName})`);
  return certificate;
};

// ─── Issue Certificate (main entry point) ───────────────

/**
 * Main issuance function — submits to CA if not yet submitted,
 * otherwise polls for status and downloads when ready.
 */
export const issueCertificate = async (orderId: string, adminId?: string) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { product: true, user: true },
  });

  if (!order) throw new NotFoundError('Order not found.');

  // If already issued, return the certificate
  if (order.status === 'ISSUED') {
    const cert = await prisma.certificate.findUnique({ where: { orderId } });
    if (cert) return cert;
  }

  // Check if already submitted to CA
  if (order.caOrderId) {
    // Poll for status and potentially download
    const status = await pollCAStatus(orderId);

    if (status.status === 'issued') {
      const cert = await prisma.certificate.findUnique({ where: { orderId } });
      if (cert) return cert;
    }

    return {
      caOrderId: order.caOrderId,
      caStatus: status.status,
      caRawStatus: status.caRawStatus,
      message: `Certificate is ${status.status}. ${status.status === 'pending' ? 'Check back later.' : ''}`,
    };
  }

  // Not yet submitted — submit now
  if (!['PENDING_ISSUANCE', 'PAID'].includes(order.status)) {
    throw new BadRequestError(`Order is not ready for issuance. Current status: ${order.status}`);
  }

  // Audit
  if (adminId) {
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_ACTION',
        resourceId: orderId,
        metadata: { action: 'issue_certificate', orderId },
      },
    });
  }

  return submitToCA(orderId);
};

// ─── Get Certificate for Order ──────────────────────────

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
          caProvider: true,
          product: { select: { name: true, type: true, brand: true } },
        },
      },
    },
  });

  if (!certificate) throw new NotFoundError('Certificate not yet issued for this order.');
  return certificate;
};

// ─── Download Certificate File ──────────────────────────

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

  if (fileType === 'cert')      fileKey = certificate.certFileKey;
  else if (fileType === 'chain') fileKey = certificate.chainFileKey;
  else if (fileType === 'fullchain') fileKey = certificate.certFileKey;

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

// ─── List User's Certificates ───────────────────────────

export const listCertificates = async (
  userId: string,
  filters: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    productType?: string;
    caProvider?: string;
    expiryFrom?: string;
    expiryTo?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
) => {
  const {
    page = 1, limit = 10, status, search,
    productType, caProvider, expiryFrom, expiryTo, dateFrom, dateTo,
  } = filters;
  const now = new Date();

  const orderWhere: any = { userId, status: 'ISSUED' };
  if (productType) orderWhere.product = { type: productType };
  if (caProvider) orderWhere.caProvider = caProvider;

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
      { thumbprint:   { contains: search, mode: 'insensitive' } },
    ];
  }
  if (expiryFrom || expiryTo) {
    where.expiresAt = where.expiresAt || {};
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
            orderNumber: true,
            validity: true,
            caProvider: true,
            product: { select: { name: true, type: true, brand: true } },
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

// ─── Admin: Force Issue ─────────────────────────────────

export const adminIssueCertificate = async (adminId: string, orderId: string) => {
  const order = await prisma.certificateOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found.');

  if (!['PENDING_ISSUANCE', 'PENDING_VALIDATION', 'PAID'].includes(order.status)) {
    throw new BadRequestError('Order cannot be issued in its current state.');
  }

  // Force status to PENDING_ISSUANCE if not already
  if (order.status !== 'PENDING_ISSUANCE') {
    await prisma.certificateOrder.update({
      where: { id: orderId },
      data: { status: 'PENDING_ISSUANCE' },
    });
    await logOrderStatus(order.id, order.status as any, 'PENDING_ISSUANCE', {
      reason: 'Admin forced issuance',
      changedBy: adminId,
    });
  }

  return issueCertificate(orderId, adminId);
};

// ─── Revoke Certificate ─────────────────────────────────

export const revokeCertificate = async (
  certificateId: string,
  userId: string,
  reason?: string
) => {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { order: { include: { product: true } } },
  });

  if (!certificate) throw new NotFoundError('Certificate not found.');
  if (certificate.order.userId !== userId) throw new ForbiddenError('Access denied.');
  if (certificate.revokedAt) throw new BadRequestError('Certificate is already revoked.');

  // Revoke with CA if we have a CA order
  if (certificate.order.caOrderId) {
    try {
      const provider = resolveProvider(certificate.order.caProvider);
      await provider.revokeCertificate(certificate.order.caOrderId, reason);
      logger.info(`Certificate revoked with CA for order ${certificate.orderId}`);
    } catch (err: any) {
      logger.error(`CA revocation failed: ${err.message}`);
      throw new BadRequestError(`Failed to revoke with CA: ${err.message}`);
    }
  }

  // Mark as revoked locally
  await prisma.certificate.update({
    where: { id: certificateId },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'ADMIN_ACTION',
      resourceId: certificateId,
      metadata: { action: 'certificate_revoked', reason },
    },
  });

  return { message: 'Certificate revoked successfully.' };
};
