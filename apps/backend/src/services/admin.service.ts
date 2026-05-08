import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Dashboard Stats ──────────────────────────────────

export const getDashboardStats = async () => {
  const [
    totalUsers,
    activeUsers,
    pendingKyc,
    totalOrders,
    issuedCerts,
    pendingOrders,
    revenueResult,
    recentOrders,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as count FROM kyc_documents WHERE status::text = 'PENDING'`).then(r => r[0]?.count || 0),
    prisma.certificateOrder.count(),
    prisma.certificateOrder.count({ where: { status: 'ISSUED' } }),
    prisma.certificateOrder.count({ where: { status: { in: ['PENDING_PAYMENT', 'PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE'] } } }),
    prisma.transaction.aggregate({
      where: { type: 'WALLET_FUNDING' },
      _sum: { amountNgn: true },
    }),
    prisma.certificateOrder.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, firstName: true, lastName: true, email: true, status: true, createdAt: true },
    }),
  ]);

  return {
    stats: {
      totalUsers,
      activeUsers,
      pendingKyc,
      totalOrders,
      issuedCerts,
      pendingOrders,
      totalRevenue: revenueResult._sum?.amountNgn || new Decimal(0),
    },
    recentOrders,
    recentUsers,
  };
};

// ─── Users ────────────────────────────────────────────

export const getUsers = async (params: {
  page: number; limit: number; search?: string; status?: string; role?: string;
}) => {
  const { page, limit, search, status, role } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (status) where.status = status;
  if (role) where.role = role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, status: true, emailVerified: true, createdAt: true,
        wallet: { select: { balanceNgn: true } },
        _count: { select: { orders: true, kycDocuments: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit, pages: Math.ceil(total / limit) };
};

export const getUserDetail = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      phone: true, role: true, status: true, emailVerified: true,
      twoFactorEnabled: true, createdAt: true, updatedAt: true,
      organization: { select: { id: true, name: true } },
      wallet: { select: { id: true, balanceNgn: true } },
      kycDocuments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, documentType: true, status: true, createdAt: true, reviewNotes: true },
      },
      orders: {
        take: 10, orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true, product: { select: { name: true } } },
      },
      _count: { select: { orders: true } },
    },
  });
  if (!user) throw new NotFoundError('User not found.');
  return user;
};

export const updateUserStatus = async (adminId: string, userId: string, status: string) => {
  const valid = ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
  if (!valid.includes(status)) throw new BadRequestError('Invalid status.');

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: status as any },
    select: { id: true, email: true, status: true },
  });

  await prisma.auditLog.create({
    data: { userId: adminId, action: 'ADMIN_ACTION', metadata: { action: 'user_status_updated', targetUserId: userId, newStatus: status } },
  });

  const statusMessages: Record<string, { title: string; message: string }> = {
    ACTIVE: {
      title: 'Your account has been activated',
      message: 'Your account has been reactivated by an administrator. You now have full access to the platform.',
    },
    SUSPENDED: {
      title: 'Your account has been suspended',
      message: 'Your account has been suspended by an administrator. Please contact support if you believe this is a mistake.',
    },
    PENDING_VERIFICATION: {
      title: 'Your account is pending verification',
      message: 'Your account status has been updated to pending verification. Please complete any required steps to regain full access.',
    },
  };

  const notifContent = statusMessages[status];
  if (notifContent) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        channel: 'IN_APP',
        title: notifContent.title,
        message: notifContent.message,
      },
    });
  }

  logger.info(`Admin ${adminId} updated user ${userId} status to ${status}`);
  return user;
};

export const updateUserRole = async (adminId: string, userId: string, role: string) => {
  const valid = ['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'];
  if (!valid.includes(role)) throw new BadRequestError('Invalid role.');

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
    select: { id: true, email: true, role: true },
  });

  await prisma.auditLog.create({
    data: { userId: adminId, action: 'ADMIN_ACTION', metadata: { action: 'user_role_updated', targetUserId: userId, newRole: role } },
  });

  const roleLabels: Record<string, string> = {
    CUSTOMER: 'Customer',
    ADMIN: 'Admin',
    SUPER_ADMIN: 'Super Admin',
  };
  const oldRoleLabel = roleLabels[existingUser?.role ?? ''] ?? existingUser?.role ?? 'Unknown';
  const newRoleLabel = roleLabels[role] ?? role;

  await prisma.notification.create({
    data: {
      userId,
      type: 'SYSTEM',
      channel: 'IN_APP',
      title: 'Your account role has been updated',
      message: `Your role has been changed from ${oldRoleLabel} to ${newRoleLabel} by an administrator. If you did not expect this change, please contact support.`,
    },
  });

  logger.info(`Admin ${adminId} updated user ${userId} role from ${existingUser?.role} to ${role}`);
  return user;
};

// ─── KYC Review ───────────────────────────────────────

export const getPendingKyc = async (params: { page: number; limit: number; status?: string }) => {
  const { page, limit, status } = params;
  const skip = (page - 1) * limit;

  // Build SQL strings ahead of time (no user input in statusFilter — safe)
  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
  const sf = status && validStatuses.includes(status) ? status : null;

  const listSql = sf
    ? `SELECT k.id, k."documentType"::text as "documentType", k.status::text as status,
        k."fileKey", k."reviewNotes", k."createdAt", k."updatedAt",
        k."userId",
        json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'email', u.email) as user,
        CASE WHEN o.id IS NOT NULL THEN json_build_object('id', o.id, 'name', o.name) ELSE NULL END as organization
       FROM kyc_documents k
       JOIN users u ON u.id = k."userId"
       LEFT JOIN organizations o ON o.id = k."organizationId"
       WHERE k.status::text = $1
       ORDER BY k."createdAt" DESC
       LIMIT $2 OFFSET $3`
    : `SELECT k.id, k."documentType"::text as "documentType", k.status::text as status,
        k."fileKey", k."reviewNotes", k."createdAt", k."updatedAt",
        k."userId",
        json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'email', u.email) as user,
        CASE WHEN o.id IS NOT NULL THEN json_build_object('id', o.id, 'name', o.name) ELSE NULL END as organization
       FROM kyc_documents k
       JOIN users u ON u.id = k."userId"
       LEFT JOIN organizations o ON o.id = k."organizationId"
       WHERE k.status::text IN ('PENDING', 'APPROVED', 'REJECTED')
       ORDER BY k."createdAt" DESC
       LIMIT $1 OFFSET $2`;

  const countSql = sf
    ? `SELECT COUNT(*)::int as count FROM kyc_documents WHERE status::text = $1`
    : `SELECT COUNT(*)::int as count FROM kyc_documents WHERE status::text IN ('PENDING', 'APPROVED', 'REJECTED')`;

  const [docs, countResult] = await Promise.all([
    sf
      ? prisma.$queryRawUnsafe<any[]>(listSql, sf, limit, skip)
      : prisma.$queryRawUnsafe<any[]>(listSql, limit, skip),
    sf
      ? prisma.$queryRawUnsafe<any[]>(countSql, sf)
      : prisma.$queryRawUnsafe<any[]>(countSql),
  ]);

  const total = countResult[0]?.count || 0;
  return { docs, total, page, limit, pages: Math.ceil(total / limit) };
};

export const reviewKycDocument = async (
  adminId: string,
  docId: string,
  action: 'APPROVED' | 'REJECTED',
  reviewNotes?: string
) => {
  const docRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT k.id, k."userId", k."organizationId", k."documentType"::text as "documentType",
      k.status::text as status, k."fileName", k."fileKey"
     FROM kyc_documents k WHERE k.id = $1`,
    docId
  );
  if (!docRows.length) throw new NotFoundError('KYC document not found.');
  const doc = docRows[0];

  // Get org user for notification
  let orgUser: any = null;
  if (doc.organizationId) {
    const orgUsers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM users WHERE "organizationId" = $1 LIMIT 1`,
      doc.organizationId
    );
    orgUser = orgUsers[0] || null;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE kyc_documents SET status = $1::"KycStatus", "reviewNotes" = $2, "reviewedAt" = NOW(), "updatedAt" = NOW() WHERE id = $3`,
    action, reviewNotes || null, docId
  );
  const updated = { ...doc, status: action, reviewNotes: reviewNotes || null };

  // Notify the user
  const user = orgUser || (doc.userId ? { id: doc.userId } : null);
  if (user) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'KYC_UPDATE',
        channel: 'IN_APP',
        title: action === 'APPROVED' ? 'KYC Approved ✓' : 'KYC Requires Attention',
        message: action === 'APPROVED'
          ? 'Your identity verification has been approved. You can now place orders.'
          : `Your KYC document was rejected. ${reviewNotes || 'Please resubmit with valid documents.'}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: action === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED',
        metadata: { docId, targetUserId: user.id, reviewNotes },
      },
    });
  }

  // Send KYC email
  if (user) {
    if (action === 'APPROVED') {
      Email.sendKycApprovedEmail(user.email, user.firstName);
    } else {
      Email.sendKycRejectedEmail(user.email, user.firstName, reviewNotes);
    }
  }

  logger.info(`Admin ${adminId} ${action} KYC doc ${docId}`);
  return updated;
};

// ─── Wallet Adjustment ────────────────────────────────

export const adjustWallet = async (
  adminId: string,
  userId: string,
  amount: number,
  note: string
) => {
  if (!amount || amount === 0) throw new BadRequestError('Amount cannot be zero.');
  if (!note?.trim()) throw new BadRequestError('Note is required for wallet adjustments.');

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found.');

  const newBalance = Number(wallet.balanceNgn) + amount;
  if (newBalance < 0) throw new BadRequestError('Adjustment would result in negative balance.');

  const [updatedWallet] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balanceNgn: new Decimal(newBalance) },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'ADMIN_ADJUSTMENT',
        amountNgn: new Decimal(Math.abs(amount)),
        balanceBefore: new Decimal(Number(wallet.balanceNgn)),
        balanceAfter: new Decimal(newBalance),
        description: `Admin adjustment: ${note}`,
        reference: `ADJ-${Date.now()}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'WALLET_ADJUSTED',
        metadata: { targetUserId: userId, amount, note, newBalance },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: 'WALLET_FUNDED',
        channel: 'IN_APP',
        title: amount > 0 ? 'Wallet Credited' : 'Wallet Debited',
        message: `Your wallet has been ${amount > 0 ? 'credited' : 'debited'} ₦${Math.abs(amount).toLocaleString()} by admin. Note: ${note}`,
      },
    }),
  ]);

  return { wallet: updatedWallet, newBalance };
};

// ─── Orders ───────────────────────────────────────────

export const getOrders = async (params: {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  productType?: string;
  dateFrom?: string;
  dateTo?: string;
  orderNumber?: string;
}) => {
  const { page, limit, status, search, productType, dateFrom, dateTo, orderNumber } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status)      where.status = status;
  if (productType) where.product = { type: productType };
  if (orderNumber) where.orderNumber = { contains: orderNumber, mode: 'insensitive' };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo)   where.createdAt.lte = new Date(dateTo);
  }
  if (search) {
    where.OR = [
      { commonName:   { contains: search, mode: 'insensitive' } },
      { orderNumber:  { contains: search, mode: 'insensitive' } },
      { user: { email:     { contains: search, mode: 'insensitive' } } },
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { user: { lastName:  { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.certificateOrder.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNumber: true, status: true, commonName: true,
        priceNgn: true, validity: true, createdAt: true,
        user:    { select: { id: true, email: true, firstName: true, lastName: true } },
        product: { select: { name: true, type: true } },
        certificate: { select: { serialNumber: true, expiresAt: true, issuedAt: true } },
      },
    }),
    prisma.certificateOrder.count({ where }),
  ]);

  return { orders, total, page, limit, pages: Math.ceil(total / limit) };
};

// ─── Audit Logs ───────────────────────────────────────

export const getAuditLogs = async (params: {
  page: number; limit: number;
  userId?: string; action?: string;
  dateFrom?: string; dateTo?: string; search?: string;
}) => {
  const { page, limit, userId, action, dateFrom, dateTo, search } = params;
  const skip = (page - 1) * limit;
  const where: any = {};

  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo)   where.createdAt.lte = new Date(dateTo);
  }
  if (search) {
    where.OR = [
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { user: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, limit, pages: Math.ceil(total / limit) };
};

// ─── Admin: List all certificates ────────────────────

export const getAdminCertificates = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  productType?: string;
  expiryFrom?: string;
  expiryTo?: string;
  userId?: string;
}) => {
  const { page, limit, search, status, productType, expiryFrom, expiryTo, userId } = params;
  const skip = (page - 1) * limit;
  const now  = new Date();

  // Build order filter
  const orderWhere: any = { status: 'ISSUED' };
  if (userId)      orderWhere.userId    = userId;
  if (productType) orderWhere.product   = { type: productType };

  const orders = await prisma.certificateOrder.findMany({
    where: orderWhere,
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const where: any = { orderId: { in: orderIds } };

  // Status filter
  if (status === 'active')  { where.revokedAt = null; where.expiresAt = { gt: now }; }
  if (status === 'expired') where.expiresAt = { lte: now };
  if (status === 'revoked') where.revokedAt = { not: null };

  // Search: CN, serial, thumbprint
  if (search) {
    where.OR = [
      { commonName:   { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { thumbprint:   { contains: search, mode: 'insensitive' } },
      { order: { user: { email:     { contains: search, mode: 'insensitive' } } } },
      { order: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
      { order: { user: { lastName:  { contains: search, mode: 'insensitive' } } } },
    ];
  }

  // Expiry range
  if (expiryFrom || expiryTo) {
    where.expiresAt = where.expiresAt || {};
    if (expiryFrom) where.expiresAt.gte = new Date(expiryFrom);
    if (expiryTo)   where.expiresAt.lte = new Date(expiryTo);
  }

  const [certificates, total] = await Promise.all([
    prisma.certificate.findMany({
      where, skip, take: limit,
      orderBy: { issuedAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            validity: true,
            priceNgn: true,
            product: { select: { name: true, type: true } },
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.certificate.count({ where }),
  ]);

  return {
    certificates: certificates.map((c) => ({
      ...c,
      isExpired:       c.expiresAt < now,
      daysUntilExpiry: Math.ceil((c.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    total, page, limit,
    pages: Math.ceil(total / limit),
  };
};

// ─── Admin: Revoke a certificate ─────────────────────

export const revokeCertificate = async (adminId: string, certId: string, reason: string) => {
  const cert = await prisma.certificate.findUnique({
    where: { id: certId },
    include: { order: { select: { userId: true, commonName: true } } },
  });
  if (!cert)            throw new NotFoundError('Certificate not found.');
  if (cert.revokedAt)   throw new BadRequestError('Certificate is already revoked.');

  const updated = await prisma.certificate.update({
    where: { id: certId },
    data:  { revokedAt: new Date() },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: {
        action:     'certificate_revoked',
        certId,
        commonName: cert.order.commonName,
        reason,
        targetUserId: cert.order.userId,
      },
    },
  });

  // In-app notification to certificate owner
  await prisma.notification.create({
    data: {
      userId:  cert.order.userId,
      type:    'SYSTEM',
      channel: 'IN_APP',
      title:   `Certificate Revoked: ${cert.commonName}`,
      message: `Your certificate for "${cert.commonName}" has been revoked by an administrator. Reason: ${reason || 'No reason provided.'}`,
      metadata: { certId, reason },
    },
  });

  logger.info(`Admin ${adminId} revoked certificate ${certId} (${cert.commonName}). Reason: ${reason}`);
  const owner = await prisma.user.findUnique({ where: { id: cert.order.userId }, select: { email: true, firstName: true } });
  if (owner) Email.sendCertificateRevokedEmail(owner.email, owner.firstName, cert.order.commonName || '', reason);
  return updated;
};

// ─── Module 17: Reports & Analytics ──────────────────

export const getRevenueChart = async (period: 'week' | 'month' | 'year' = 'month') => {
  const now = new Date();
  let startDate: Date;
  let groupFormat: string;

  if (period === 'week') {
    startDate = new Date(now); startDate.setDate(now.getDate() - 6);
    groupFormat = 'day';
  } else if (period === 'month') {
    startDate = new Date(now); startDate.setDate(now.getDate() - 29);
    groupFormat = 'day';
  } else {
    startDate = new Date(now); startDate.setMonth(now.getMonth() - 11);
    groupFormat = 'month';
  }

  // Get all wallet funding transactions in range
  const txns = await prisma.transaction.findMany({
    where: {
      type: 'WALLET_FUNDING',
      createdAt: { gte: startDate },
    },
    select: { amountNgn: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Get all orders (certificate purchases) in range
  const orders = await prisma.certificateOrder.findMany({
    where: {
      status: 'ISSUED',
      createdAt: { gte: startDate },
    },
    select: { priceNgn: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Build date buckets
  const buckets: Record<string, { label: string; revenue: number; orders: number; funding: number }> = {};

  const getKey = (d: Date) => {
    if (groupFormat === 'month') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getLabel = (key: string) => {
    if (groupFormat === 'month') {
      const [y, m] = key.split('-');
      return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-NG', { month: 'short', year: '2-digit' });
    }
    const d = new Date(key);
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  };

  // Prefill all buckets
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const key = getKey(cursor);
    if (!buckets[key]) buckets[key] = { label: getLabel(key), revenue: 0, orders: 0, funding: 0 };
    if (groupFormat === 'month') {
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const t of txns) {
    const key = getKey(new Date(t.createdAt));
    if (buckets[key]) buckets[key].funding += Number(t.amountNgn);
  }
  for (const o of orders) {
    const key = getKey(new Date(o.createdAt));
    if (buckets[key]) {
      buckets[key].revenue += Number(o.priceNgn);
      buckets[key].orders += 1;
    }
  }

  return Object.values(buckets);
};

export const getProductBreakdown = async () => {
  const results = await prisma.certificateOrder.groupBy({
    by: ['productId'],
    _count: { id: true },
    _sum: { priceNgn: true },
    where: { status: { in: ['ISSUED', 'PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE'] } },
  });

  const products = await prisma.certificateProduct.findMany({
    select: { id: true, name: true, type: true },
  });
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  return results.map(r => ({
    name:    productMap[r.productId]?.name || r.productId,
    type:    productMap[r.productId]?.type || '—',
    count:   r._count.id,
    revenue: Number(r._sum.priceNgn || 0),
  })).sort((a, b) => b.count - a.count);
};

export const getOrderStatusBreakdown = async () => {
  const results = await prisma.certificateOrder.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  return results.map(r => ({ status: r.status, count: r._count.id }));
};

export const getGrowthStats = async () => {
  const now = new Date();
  const thisMonthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd    = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    newUsersThisMonth, newUsersLastMonth,
    ordersThisMonth,   ordersLastMonth,
    revenueThisMonth,  revenueLastMonth,
    certsThisMonth,    certsLastMonth,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.user.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    prisma.certificateOrder.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.certificateOrder.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    prisma.transaction.aggregate({ where: { type: 'WALLET_FUNDING', createdAt: { gte: thisMonthStart } }, _sum: { amountNgn: true } }),
    prisma.transaction.aggregate({ where: { type: 'WALLET_FUNDING', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { amountNgn: true } }),
    prisma.certificateOrder.count({ where: { status: 'ISSUED', createdAt: { gte: thisMonthStart } } }),
    prisma.certificateOrder.count({ where: { status: 'ISSUED', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
  ]);

  const pct = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

  return {
    users:   { current: newUsersThisMonth,          prev: newUsersLastMonth,  pct: pct(newUsersThisMonth, newUsersLastMonth) },
    orders:  { current: ordersThisMonth,             prev: ordersLastMonth,    pct: pct(ordersThisMonth, ordersLastMonth) },
    revenue: { current: Number(revenueThisMonth._sum.amountNgn || 0), prev: Number(revenueLastMonth._sum.amountNgn || 0), pct: pct(Number(revenueThisMonth._sum.amountNgn || 0), Number(revenueLastMonth._sum.amountNgn || 0)) },
    certs:   { current: certsThisMonth,              prev: certsLastMonth,     pct: pct(certsThisMonth, certsLastMonth) },
  };
};

// ─── Module 20: Order Management Actions ─────────────

export const updateOrderStatus = async (adminId: string, orderId: string, status: string) => {
  const validTransitions: Record<string, string[]> = {
    PENDING_PAYMENT:    [],
    PAID:               ['PENDING_VALIDATION', 'CANCELLED'],
    PENDING_VALIDATION: ['VALIDATING', 'CANCELLED'],
    VALIDATING:         ['PENDING_ISSUANCE', 'PENDING_VALIDATION', 'CANCELLED'],
    PENDING_ISSUANCE:   ['CANCELLED'],
    ISSUED:             [],
    CANCELLED:          [],
    REFUNDED:           [],
  };

  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true, firstName: true } } },
  });
  if (!order) throw new NotFoundError('Order not found.');

  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(status)) {
    throw new BadRequestError(`Cannot move order from ${order.status} to ${status}.`);
  }

  const updated = await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { status: status as any },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: {
        action: 'order_status_updated',
        orderId,
        orderNumber: order.orderNumber,
        from: order.status,
        to: status,
      },
    },
  });

  // Notify customer
  await prisma.notification.create({
    data: {
      userId: order.userId,
      type: 'ORDER_UPDATE',
      channel: 'IN_APP',
      title: `Order ${order.orderNumber} Updated`,
      message: `Your order status has been updated to: ${status.replace(/_/g, ' ')}.`,
      metadata: { orderId, orderNumber: order.orderNumber, status },
    },
  });

  logger.info(`Admin ${adminId} updated order ${orderId} from ${order.status} → ${status}`);
  return updated;
};

export const getOrderDetail = async (orderId: string) => {
  const order = await prisma.certificateOrder.findUnique({
    where: { id: orderId },
    include: {
      user:        { select: { id: true, email: true, firstName: true, lastName: true } },
      product:     { include: { prices: true } },
      certificate: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found.');
  return order;
};

// ─── KYC File Serve ───────────────────────────────────

export const getKycFile = async (docId: string) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT k.id, k."fileKey", k."fileName", k."mimeType", k."fileSize",
      k.status::text as status, k."documentType"::text as "documentType",
      k."reviewNotes", k."createdAt",
      json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'email', u.email) as user
     FROM kyc_documents k
     JOIN users u ON u.id = k."userId"
     WHERE k.id = $1`,
    docId
  );
  if (!rows.length) throw new NotFoundError('KYC document not found.');
  return rows[0];
};
