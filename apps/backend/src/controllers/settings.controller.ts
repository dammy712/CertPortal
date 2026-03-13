import { Request, Response, NextFunction } from 'express';
import * as SettingsService from '../services/settings.service';
import { sendSuccess } from '../utils/response';

export const getInvoiceSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.getInvoiceSettings();
    return sendSuccess(res, settings, 'Invoice settings retrieved.');
  } catch (e) { next(e); }
};

export const saveInvoiceSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.saveInvoiceSettings(req.user!.userId, req.body);
    return sendSuccess(res, settings, 'Invoice settings saved.');
  } catch (e) { next(e); }
};
