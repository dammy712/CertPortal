import { Request, Response, NextFunction } from 'express';
import * as AdminService from '../services/admin.service';
import { sendSuccess, sendBadRequest } from '../utils/response';

const p = (v: any, fallback: number) => { const n = parseInt(v); return isNaN(n) ? fallback : n; };

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getDashboardStats();
    return sendSuccess(res, result, 'Stats retrieved.');
  } catch (e) { next(e); }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getUsers({
      page: p(req.query.page, 1), limit: p(req.query.limit, 20),
      search: req.query.search as string,
      status: req.query.status as string,
      role: req.query.role as string,
    });
    return sendSuccess(res, result, 'Users retrieved.');
  } catch (e) { next(e); }
};

export const getUserDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getUserDetail(req.params.id);
    return sendSuccess(res, result, 'User retrieved.');
  } catch (e) { next(e); }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!status) return sendBadRequest(res, 'Status is required.');
    const result = await AdminService.updateUserStatus(req.user!.userId, req.params.id, status);
    return sendSuccess(res, result, 'User status updated.');
  } catch (e) { next(e); }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    if (!role) return sendBadRequest(res, 'Role is required.');
    const result = await AdminService.updateUserRole(req.user!.userId, req.params.id, role);
    return sendSuccess(res, result, 'User role updated.');
  } catch (e) { next(e); }
};

export const getPendingKyc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getPendingKyc({
      page: p(req.query.page, 1), limit: p(req.query.limit, 20),
      status: req.query.status as string,
    });
    return sendSuccess(res, result, 'KYC documents retrieved.');
  } catch (e) { next(e); }
};

export const reviewKycDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, reviewNotes } = req.body;
    if (!action || !['APPROVED', 'REJECTED'].includes(action)) return sendBadRequest(res, 'Action must be APPROVED or REJECTED.');
    const result = await AdminService.reviewKycDocument(req.user!.userId, req.params.id, action, reviewNotes);
    return sendSuccess(res, result, `KYC document ${action.toLowerCase()}.`);
  } catch (e) { next(e); }
};

export const adjustWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, note } = req.body;
    if (amount === undefined || amount === null) return sendBadRequest(res, 'Amount is required.');
    const result = await AdminService.adjustWallet(req.user!.userId, req.params.id, Number(amount), note);
    return sendSuccess(res, result, 'Wallet adjusted successfully.');
  } catch (e) { next(e); }
};

export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await AdminService.getOrders({
      page:        p(q.page, 1),
      limit:       p(q.limit, 20),
      status:      q.status      as string,
      search:      q.search      as string,
      productType: q.productType as string,
      dateFrom:    q.dateFrom    as string,
      dateTo:      q.dateTo      as string,
      orderNumber: q.orderNumber as string,
    });
    return sendSuccess(res, result, 'Orders retrieved.');
  } catch (e) { next(e); }
};

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getAuditLogs({
      page: p(req.query.page, 1), limit: p(req.query.limit, 20),
      userId: req.query.userId as string,
    });
    return sendSuccess(res, result, 'Audit logs retrieved.');
  } catch (e) { next(e); }
};

export const getAdminCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await AdminService.getAdminCertificates({
      page:        p(q.page, 1),
      limit:       p(q.limit, 20),
      search:      q.search      as string,
      status:      q.status      as string,
      productType: q.productType as string,
      expiryFrom:  q.expiryFrom  as string,
      expiryTo:    q.expiryTo    as string,
      userId:      q.userId      as string,
    });
    return sendSuccess(res, result, 'Certificates retrieved.');
  } catch (e) { next(e); }
};

export const revokeCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const result = await AdminService.revokeCertificate(
      req.user!.userId,
      req.params.id,
      reason || ''
    );
    return sendSuccess(res, result, 'Certificate revoked.');
  } catch (e) { next(e); }
};

// ─── Module 17: Analytics endpoints ──────────────────

export const getRevenueChart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = (req.query.period as 'week' | 'month' | 'year') || 'month';
    const data = await AdminService.getRevenueChart(period);
    return sendSuccess(res, data, 'Revenue chart data retrieved.');
  } catch (e) { next(e); }
};

export const getProductBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AdminService.getProductBreakdown();
    return sendSuccess(res, data, 'Product breakdown retrieved.');
  } catch (e) { next(e); }
};

export const getOrderStatusBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AdminService.getOrderStatusBreakdown();
    return sendSuccess(res, data, 'Order status breakdown retrieved.');
  } catch (e) { next(e); }
};

export const getGrowthStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AdminService.getGrowthStats();
    return sendSuccess(res, data, 'Growth stats retrieved.');
  } catch (e) { next(e); }
};

// ─── Module 20: Order Management Actions ─────────────

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) { res.status(400).json({ message: 'Status is required.' }); return; }
    const result = await AdminService.updateOrderStatus(req.user!.userId, id, status);
    return sendSuccess(res, result, 'Order status updated.');
  } catch (e) { next(e); }
};

export const getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.getOrderDetail(req.params.id);
    return sendSuccess(res, result, 'Order retrieved.');
  } catch (e) { next(e); }
};

export const adminIssueOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const IssuanceService = await import('../services/issuance.service');
    const result = await IssuanceService.adminIssueCertificate(req.user!.userId, req.params.id);
    return sendSuccess(res, result, 'Certificate issued successfully.');
  } catch (e) { next(e); }
};

// ─── KYC File Preview ─────────────────────────────────

export const getKycFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await AdminService.getKycFile(req.params.id);
    return sendSuccess(res, doc, 'KYC document retrieved.');
  } catch (e) { next(e); }
};

export const serveKycFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fs   = await import('fs');
    const path = await import('path');
    const { logger } = await import('../utils/logger');

    let doc: any;
    try {
      doc = await AdminService.getKycFile(req.params.id);
    } catch (fetchErr: any) {
      logger.error(`getKycFile failed for ${req.params.id}: ${fetchErr.message}`);
      res.status(404).json({ message: 'Document record not found.' });
      return;
    }

    if (!doc.fileKey) {
      res.status(404).json({ message: 'No file key on document.' });
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', doc.fileKey);
    logger.info(`Serving KYC file: ${filePath} (exists: ${fs.existsSync(filePath)})`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        message: 'File not found on disk. It may have been lost after a container restart.',
        fileKey: doc.fileKey,
      });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
};
