import { Router } from 'express';
import * as NotificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/',              NotificationController.getNotifications);
router.get('/unread-count',  NotificationController.getUnreadCount);
router.post('/mark-all-read', NotificationController.markAllAsRead);
router.delete('/clear-read', NotificationController.clearReadNotifications);
router.patch('/:id/read',    NotificationController.markAsRead);
router.delete('/:id',        NotificationController.deleteNotification);

export default router;
