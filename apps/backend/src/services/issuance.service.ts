import { logOrderStatus } from '../utils/orderHistory';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { uploadFile, getSignedUrl } from '../utils/fileUpload';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ─── Generate Certificate (Dev: self-signed via openssl) ──

const generateCertificate = async (order: any): Promise<{
  certPem: string;
  chainPem: string;
  serialNumber: string;
  thumbprint: string;
  issuedAt: Date;
  expiresAt: Date;
}> => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-'));

  try {
    const commonName = (order.commonName || 'localhost').replace(/^\*\./, 'wildcard.');
    const sans = order.sans?.length ? order.sans : [order.commonName || 'localhost'];

    const validityDays = order.validity === 'THREE_YEARS' ? 1095
      : order.validity === 'TWO_YEARS' ? 730 : 365;

    const keyPath  = path.join(tmpDir, 'key.pem');
    const csrPath  = path.join(tmpDir, 'csr.pem');
    const certPath = path.join(tmpDir, 'cert.pem');
    const extPath  = path.join(tmpDir, 'ext.cnf');

    const sanList = sans.map((s: string, i: number) => `DNS.${i + 1} = ${s}`).join('\n');
    const extContent = `[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\n[v3_req]\nsubjectAltName = @alt_names\n[alt_names]\n${sanList}\n[SAN]\n${sanList}`;
    fs.writeFileSync(extPath, extContent);

    execSync(`openssl genrsa -out "${keyPath}" 2048 2>/dev/null`);
    execSync(`openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=${commonName}/O=CertPortal Dev/C=NG" 2>/dev/null`);
    execSync(
      `openssl x509 -req -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}" -days ${validityDays} -extensions SAN -extfile "${extPath}" 2>/dev/null`
    );

    const certPem = fs.readFileSync(certPath, 'utf8');

    const thumbprint = execSync(`openssl x509 -in "${certPath}" -fingerprint -sha1 -noout 2>/dev/null`)
      .toString().replace('SHA1 Fingerprint=', '').trim();

    const serialNumber = execSync(`openssl x509 -in "${certPath}" -serial -noout 2>/dev/null`)
      .toString().replace('serial=', '').trim();

    const notBeforeRaw = execSync(`openssl x509 -in "${certPath}" -noout -startdate 2>/dev/null`).toString().replace('notBefore=', '').trim();
    const notAfterRaw  = execSync(`openssl x509 -in "${certPath}" -noout -enddate 2>/dev/null`).toString().replace('notAfter=', '').trim();

    const issuedAt  = new Date(notBeforeRaw);
    const expiresAt = new Date(notAfterRaw);

    const chainPem = certPem;

    return { certPem, chainPem, serialNumber, thumbprint, issuedAt, expiresAt };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

// ─── Issue Certificate ────────────────────────────────

export const issueCertificate = async (orderId: string, adminId?: string) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { product: true, user: true },
  });

  if (!order) throw new NotFoundError('Order not found.');
  if (order.status !== 'PENDING_ISSUANCE') {
    throw new BadRequestError(`Order is not ready for issuance. Current status: ${order.status}`);
  }

  const existing = await prisma.certificate.findUnique({ where: { orderId } });
  if (existing) throw new BadRequestError('Certificate already issued for this order.');

  logger.info(`Issuing certificate for order ${orderId}...`);

  const { certPem, chainPem, serialNumber, thumbprint, issuedAt, expiresAt } =
    await generateCertificate(order);

  const certBuffer = Buffer.from(certPem, 'utf8');
  const chainBuffer = Buffer.from(chainPem, 'utf8');

  const { key: certKey } = await uploadFile(certBuffer, `${order.orderNumber}.crt`, 'application/x-pem-file', `certificates/${order.userId}`);
  const { key: chainKey } = await uploadFile(chainBuffer, `${order.orderNumber}-chain.crt`, 'application/x-pem-file', `certificates/${order.userId}`);

  const certificate = await prisma.certificate.create({
    data: {
      orderId,
      serialNumber,
      thumbprint,
      commonName: order.commonName || '',
      issuerName: 'CertPortal Dev CA',
      subjectAltNames: order.sans || [],
      certFileKey: certKey,
      chainFileKey: chainKey,
      issuedAt,
      expiresAt,
    },
  });

  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { status: 'ISSUED', caStatus: 'issued' },
  });
  await logOrderStatus(orderId, 'PENDING_ISSUANCE', 'ISSUED', {
    reason: 'Certificate issued by Certificate Authority',
    note: `Certificate serial: ${certificate.serialNumber || 'N/A'}`,
    changedBy: 'system',
  });

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

  await prisma.auditLog.create({
    data: {
      userId: adminId || order.userId,
      action: 'CERT_DOWNLOADED',
      resourceId: certificate.id,
      metadata: { orderId, commonName: order.commonName, issuedBy: adminId ? 'admin' : 'system' },
    },
  });

  logger.info(`Certificate issued: ${certificate.id} for ${order.commonName}`);

  const owner = await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, firstName: true } });
  if (owner) Email.sendCertificateIssuedEmail(owner.email, owner.firstName, order.commonName || '', certificate.expiresAt, order.id);

  return certificate;
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

// ─── List User's Certificates ─────────────────────────

export const listCertificates = async (
  userId: string,
  filters: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    productType?: string;
    expiryFrom?: string;
    expiryTo?: string;
    dateFrom?: string;
    dateTo?: string;
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

// ─── Admin: Issue manually ────────────────────────────

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
    await logOrderStatus(order.id, order.status as any, 'PENDING_ISSUANCE', {
      reason: 'Submitted to Certificate Authority for issuance',
      changedBy: 'system',
    });
  }

  return issueCertificate(orderId, adminId);
};
