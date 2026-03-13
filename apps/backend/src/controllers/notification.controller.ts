import { Request, Response, NextFunction } from 'express';
import * as NotificationService from '../services/notification.service';
import { sendSuccess } from '../utils/response';

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page       = parseInt(req.query.page as string) || 1;
    const limit      = parseInt(req.query.limit as string) || 20;
    const unreadOnly = req.query.unread === 'true';
    const result     = await NotificationService.getNotifications(req.user!.userId, page, limit, unreadOnly);
    return sendSuccess(res, result.notifications, 'Notifications retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.getUnreadCount(req.user!.userId);
    return sendSuccess(res, result, 'Unread count retrieved.');
  } catch (error) { next(error); }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.markAsRead(req.params.id, req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.markAllAsRead(req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.deleteNotification(req.params.id, req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const clearReadNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.clearReadNotifications(req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};
