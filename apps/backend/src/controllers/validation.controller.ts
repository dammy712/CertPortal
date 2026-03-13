import { Request, Response, NextFunction } from 'express';
import * as ValidationService from '../services/validation.service';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';

export const initializeValidation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId, method, validationEmail } = req.body;
    if (!orderId || !method) return sendBadRequest(res, 'orderId and method are required.');
    const validMethods = ['EMAIL', 'DNS_TXT', 'DNS_CNAME', 'HTTP_FILE'];
    if (!validMethods.includes(method)) return sendBadRequest(res, 'Invalid validation method.');

    const result = await ValidationService.initializeValidation(
      orderId, req.user!.userId, method, validationEmail
    );
    return sendCreated(res, result, 'Validation initialized.');
  } catch (error) { next(error); }
};

export const getValidations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ValidationService.getValidations(req.params.orderId, req.user!.userId);
    return sendSuccess(res, result, 'Validations retrieved.');
  } catch (error) { next(error); }
};

export const checkValidation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ValidationService.checkValidation(req.params.id, req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const adminValidateDomain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ValidationService.adminValidateDomain(req.user!.userId, req.params.id);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};
