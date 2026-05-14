/**
 * Compliance Report Service
 * Generates a full compliance summary for admin download.
 * Covers: KYC status, audit logs, certificate activity, wallet transactions.
 */

import { prisma } from '../utils/prisma';

export const generateComplianceReport = async (params: {
  from?: string;
  to?: string;
  format?: 'json' | 'csv';
}) => {
  const { from, to, format = 'json' } = params;

  const dateFilter: any = {};
  if (from) dateFilter.gte = new Date(from);
  if (to)   dateFilter.lte = new Date(to + 'T23:59:59Z');

  const where = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

  const [
    totalUsers,
    kycApproved,
    kycPending,
    kycRejected,
    totalOrders,
    totalCertificates,
    activeCertificates,
    expiredCertificates,
    totalWalletFunding,
    auditLogs,
  ] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { kycDocuments: { some: { status: 'APPROVED' } }, ...where } }),
    prisma.user.count({ where: { kycDocuments: { some: { status: 'PENDING'  } }, ...where } }),
    prisma.user.count({ where: { kycDocuments: { some: { status: 'REJECTED' } }, ...where } }),
    prisma.certificateOrder.count({ where }),
    prisma.certificate.count({ where }),
    prisma.certificate.count({ where: { revokedAt: null, expiresAt: { gt: new Date() }, ...where } }),
    prisma.certificate.count({ where: { expiresAt: { lt: new Date() }, ...where } }),
    prisma.transaction.aggregate({
      where: { type: 'WALLET_FUNDING', paystackStatus: 'success', ...where },
      _sum: { amountNgn: true },
    }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    }),
  ]);

  const summary = {
    generatedAt: new Date().toISOString(),
    period: { from: from || 'all time', to: to || 'present' },
    users: { total: totalUsers, kycApproved, kycPending, kycRejected },
    orders: { total: totalOrders },
    certificates: { total: totalCertificates, active: activeCertificates, expired: expiredCertificates },
    wallet: { totalFunded: Number(totalWalletFunding._sum.amountNgn || 0) },
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      userId: log.userId,
      userEmail: log.user?.email || '',
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : '',
      resourceId: log.resourceId,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata,
    })),
  };

  if (format === 'csv') {
    const header = 'Timestamp,Action,User Email,User Name,Resource ID,Details';
    const rows = summary.auditLogs.map((log) => [
      log.createdAt,
      log.action,
      `"${log.userEmail}"`,
      `"${log.userName}"`,
      log.resourceId || '',
      `"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`,
    ].join(','));
    return { csv: [header, ...rows].join('\n'), summary };
  }

  return { summary };
};
