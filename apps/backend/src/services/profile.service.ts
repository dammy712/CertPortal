import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

// ─── Get Profile ──────────────────────────────────────

export const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      emailVerified: true,
      twoFactorEnabled: true,
      darkMode: true,
      timezone: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { id: true, name: true, kycStatus: true } },
      wallet: { select: { id: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!user) throw new NotFoundError('User not found.');

  // Fetch wallet separately to get balance
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { balanceNgn: true },
  });

  // Fetch KYC docs via raw query to avoid Prisma enum validation on extended DocumentType values
  const kycDocuments = user.organizationId
    ? await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "documentType"::text as "documentType", status::text as status
         FROM kyc_documents WHERE "organizationId" = $1 ORDER BY "createdAt" DESC`,
        user.organizationId
      )
    : await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "documentType"::text as "documentType", status::text as status
         FROM kyc_documents WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
        user.id
      );

  // Derive KYC status from documents
  const docs = kycDocuments;
  let kycStatus = 'NOT_STARTED';
  if (docs.length > 0) {
    if (docs.every((d: any) => d.status === 'APPROVED')) kycStatus = 'APPROVED';
    else if (docs.some((d: any) => d.status === 'REJECTED')) kycStatus = 'REJECTED';
    else if (docs.some((d: any) => d.status === 'APPROVED')) kycStatus = 'UNDER_REVIEW';
    else kycStatus = 'PENDING';
  }

  return { ...user, wallet, kycStatus };
};

// ─── Update Profile ───────────────────────────────────

export const updateProfile = async (
  userId: string,
  data: { firstName?: string; lastName?: string; phone?: string; timezone?: string }
) => {
  const { firstName, lastName, phone, timezone } = data;

  if (firstName && firstName.trim().length < 2) throw new BadRequestError('First name must be at least 2 characters.');
  if (lastName && lastName.trim().length < 2) throw new BadRequestError('Last name must be at least 2 characters.');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstName && { firstName: firstName.trim() }),
      ...(lastName && { lastName: lastName.trim() }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(timezone && { timezone }),
    },
    select: {
      id: true, email: true, firstName: true,
      lastName: true, phone: true, timezone: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'profile_updated', fields: Object.keys(data) },
    },
  });

  logger.info(`Profile updated for user ${userId}`);
  return updated;
};

// ─── Change Password ──────────────────────────────────

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  if (newPassword.length < 8) throw new BadRequestError('New password must be at least 8 characters.');
  if (currentPassword === newPassword) throw new BadRequestError('New password must be different from current password.');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new NotFoundError('User not found.');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect.');

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });

  // Revoke all refresh tokens to force re-login on other devices
  await prisma.refreshToken.deleteMany({ where: { userId } });

  await prisma.auditLog.create({
    data: { userId, action: 'PASSWORD_CHANGED', metadata: { source: 'profile' } },
  });

  logger.info(`Password changed for user ${userId}`);
  return { message: 'Password changed successfully. Other sessions have been logged out.' };
};

// ─── Update Preferences ───────────────────────────────

export const updatePreferences = async (
  userId: string,
  data: { darkMode?: boolean; timezone?: string }
) => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.darkMode !== undefined && { darkMode: data.darkMode }),
      ...(data.timezone && { timezone: data.timezone }),
    },
    select: { darkMode: true, timezone: true },
  });
  return updated;
};

// ─── Get Active Sessions ──────────────────────────────

export const getSessions = async (userId: string) => {
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return sessions.map((s) => ({
    ...s,
    device: parseUserAgent(s.userAgent),
  }));
};

// ─── Revoke Session ───────────────────────────────────

export const revokeSession = async (userId: string, sessionId: string) => {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new NotFoundError('Session not found.');

  await prisma.session.delete({ where: { id: sessionId } });
  return { message: 'Session revoked successfully.' };
};

// ─── Revoke All Other Sessions ────────────────────────

export const revokeAllSessions = async (userId: string, currentSessionId?: string) => {
  const where: any = { userId };
  if (currentSessionId) where.id = { not: currentSessionId };

  const { count } = await prisma.session.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where: { userId } });

  return { message: `${count} session${count !== 1 ? 's' : ''} revoked.`, count };
};

// ─── Parse User Agent ─────────────────────────────────

const parseUserAgent = (ua: string | null): string => {
  if (!ua) return 'Unknown Device';
  if (ua.includes('iPhone') || ua.includes('iPad')) return '📱 iOS Device';
  if (ua.includes('Android')) return '📱 Android Device';
  if (ua.includes('Mac')) {
    if (ua.includes('Chrome')) return '🖥 Mac · Chrome';
    if (ua.includes('Firefox')) return '🖥 Mac · Firefox';
    if (ua.includes('Safari')) return '🖥 Mac · Safari';
    return '🖥 Mac';
  }
  if (ua.includes('Windows')) {
    if (ua.includes('Chrome')) return '🖥 Windows · Chrome';
    if (ua.includes('Firefox')) return '🖥 Windows · Firefox';
    return '🖥 Windows';
  }
  if (ua.includes('Linux')) return '🖥 Linux';
  return '🌐 Browser';
};

// ─── Change Email ─────────────────────────────────────

export const changeEmail = async (
  userId: string,
  newEmail: string,
  currentPassword: string
) => {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed.includes('@')) throw new BadRequestError('Invalid email address.');

  // Verify password
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new NotFoundError('User not found.');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect.');

  // Check email not already taken
  const existing = await prisma.user.findUnique({ where: { email: trimmed } });
  if (existing && existing.id !== userId) throw new BadRequestError('Email already in use.');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { email: trimmed },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'email_changed', newEmail: trimmed },
    },
  });

  logger.info(`Email changed for user ${userId} to ${trimmed}`);
  return updated;
};
