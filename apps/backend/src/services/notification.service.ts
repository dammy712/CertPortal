import { prisma } from '../utils/prisma';
import { NotFoundError, ForbiddenError } from '../utils/errors';

// ─── Get Notifications ────────────────────────────────

export const getNotifications = async (
  userId: string,
  page = 1,
  limit = 20,
  unreadOnly = false
) => {
  const where: any = { userId };
  if (unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), unreadCount },
  };
};

// ─── Get Unread Count ─────────────────────────────────

export const getUnreadCount = async (userId: string) => {
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { unreadCount: count };
};

// ─── Mark One as Read ─────────────────────────────────

export const markAsRead = async (notificationId: string, userId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) throw new NotFoundError('Notification not found.');
  if (notification.userId !== userId) throw new ForbiddenError('Access denied.');

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

  return { message: 'Notification marked as read.' };
};

// ─── Mark All as Read ─────────────────────────────────

export const markAllAsRead = async (userId: string) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { message: `${count} notification${count !== 1 ? 's' : ''} marked as read.`, count };
};

// ─── Delete Notification ──────────────────────────────

export const deleteNotification = async (notificationId: string, userId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) throw new NotFoundError('Notification not found.');
  if (notification.userId !== userId) throw new ForbiddenError('Access denied.');

  await prisma.notification.delete({ where: { id: notificationId } });
  return { message: 'Notification deleted.' };
};

// ─── Clear All Read ───────────────────────────────────

export const clearReadNotifications = async (userId: string) => {
  const { count } = await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  });
  return { message: `${count} notification${count !== 1 ? 's' : ''} cleared.`, count };
};
