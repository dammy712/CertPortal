import { Request, Response, NextFunction } from 'express';
import * as VerifyService from '../services/verify.service';
import { sendSuccess } from '../utils/response';
import { BadRequestError } from '../utils/errors';

export const lookupCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string || req.params.serial || '').trim();
    if (!query) throw new BadRequestError('Please provide a serial number, thumbprint, or domain.');

    const result = await VerifyService.lookupCertificate(query);
    return sendSuccess(res, result, 'Certificate lookup complete.');
  } catch (e) { next(e); }
};
