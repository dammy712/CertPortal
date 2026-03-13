import { Request, Response, NextFunction } from 'express';
import * as KycService from '../services/kyc.service';
import { handleUpload } from '../middleware/upload.middleware';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';
import { BadRequestError } from '../utils/errors';

// ─── Customer: Get KYC Status ─────────────────────────

export const getKycStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await KycService.getKycStatus(req.user!.userId);
    return sendSuccess(res, result, 'KYC status retrieved.');
  } catch (error) { next(error); }
};

// ─── Customer: Upload Document ────────────────────────

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Handle file upload
    await handleUpload(req, res);

    if (!req.file) throw new BadRequestError('No file uploaded.');

    const { documentType } = req.body;
    if (!documentType) throw new BadRequestError('Document type is required.');

    const document = await KycService.uploadDocument(req.user!.userId, documentType, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    return sendCreated(res, document, 'Document uploaded successfully. It will be reviewed shortly.');
  } catch (error) { next(error); }
};

// ─── Customer: Get Document URL ───────────────────────

export const getDocumentUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await KycService.getDocumentUrl(req.params.id, req.user!.userId);
    return sendSuccess(res, result, 'Document URL retrieved.');
  } catch (error) { next(error); }
};

// ─── Customer: Delete Document ────────────────────────

export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await KycService.deleteDocument(req.params.id, req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

// ─── Admin: Get KYC Queue ─────────────────────────────

export const getAdminKycQueue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const result = await KycService.getAdminKycQueue(page, limit, status);
    return sendSuccess(res, result.documents, 'KYC queue retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

// ─── Admin: Review Document ───────────────────────────

export const reviewDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, note } = req.body;
    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return sendBadRequest(res, 'Decision must be APPROVED or REJECTED.');
    }
    const result = await KycService.reviewDocument(
      req.user!.userId,
      req.params.id,
      decision,
      note
    );
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};
