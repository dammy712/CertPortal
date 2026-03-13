import { Request, Response, NextFunction } from 'express';
import * as IssuanceService from '../services/issuance.service';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';

export const getCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await IssuanceService.getCertificate(req.params.orderId, req.user!.userId);
    return sendSuccess(res, result, 'Certificate retrieved.');
  } catch (error) { next(error); }
};

export const listCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await IssuanceService.listCertificates(req.user!.userId, {
      page:        parseInt(q.page as string) || 1,
      limit:       parseInt(q.limit as string) || 10,
      status:      q.status as string,
      search:      q.search as string,
      productType: q.productType as string,
      expiryFrom:  q.expiryFrom as string,
      expiryTo:    q.expiryTo as string,
      dateFrom:    q.dateFrom as string,
      dateTo:      q.dateTo as string,
    });
    return sendSuccess(res, result.certificates, 'Certificates retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

export const downloadCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileType = (req.query.type as string) || 'cert';
    if (!['cert', 'chain', 'fullchain'].includes(fileType)) {
      return sendBadRequest(res, 'type must be cert, chain, or fullchain.');
    }
    const result = await IssuanceService.downloadCertificate(
      req.params.id,
      req.user!.userId,
      fileType as any
    );
    return sendSuccess(res, result, 'Download URL generated.');
  } catch (error) { next(error); }
};

export const adminIssueCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await IssuanceService.adminIssueCertificate(req.user!.userId, req.params.orderId);
    return sendCreated(res, result, 'Certificate issued successfully.');
  } catch (error) { next(error); }
};

// Auto-issue when order reaches PENDING_ISSUANCE (called internally or via webhook)
export const triggerIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await IssuanceService.issueCertificate(req.params.orderId);
    return sendCreated(res, result, 'Certificate issued.');
  } catch (error) { next(error); }
};
