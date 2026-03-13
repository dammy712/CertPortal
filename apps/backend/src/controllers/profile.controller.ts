import { Request, Response, NextFunction } from 'express';
import * as ProfileService from '../services/profile.service';
import { sendSuccess, sendBadRequest } from '../utils/response';

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProfileService.getProfile(req.user!.userId);
    return sendSuccess(res, result, 'Profile retrieved.');
  } catch (error) { next(error); }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, phone, timezone } = req.body;
    const result = await ProfileService.updateProfile(req.user!.userId, { firstName, lastName, phone, timezone });
    return sendSuccess(res, result, 'Profile updated successfully.');
  } catch (error) { next(error); }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return sendBadRequest(res, 'Current and new password are required.');
    const result = await ProfileService.changePassword(req.user!.userId, currentPassword, newPassword);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProfileService.updatePreferences(req.user!.userId, req.body);
    return sendSuccess(res, result, 'Preferences updated.');
  } catch (error) { next(error); }
};

export const getSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProfileService.getSessions(req.user!.userId);
    return sendSuccess(res, result, 'Sessions retrieved.');
  } catch (error) { next(error); }
};

export const revokeSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProfileService.revokeSession(req.user!.userId, req.params.id);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const revokeAllSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProfileService.revokeAllSessions(req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const changeEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newEmail, currentPassword } = req.body;
    if (!newEmail || !currentPassword) return sendBadRequest(res, 'New email and current password are required.');
    const result = await ProfileService.changeEmail(req.user!.userId, newEmail, currentPassword);
    return sendSuccess(res, result, 'Email updated successfully.');
  } catch (error) { next(error); }
};
