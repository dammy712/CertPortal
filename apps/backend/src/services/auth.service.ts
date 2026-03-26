import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { AppError, ConflictError, UnauthorizedError, BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// ─── Token Helpers ────────────────────────────────────

export const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign({ userId, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions);
};

export const generateRefreshToken = (userId: string) => {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET) as { userId: string; role: string };
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
};

// ─── Registration ─────────────────────────────────────

export const registerUser = async (data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}) => {
  // Check if email exists
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError('An account with this email already exists.');

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create email verification token
  const emailVerifyToken = uuidv4();

  // Create user + wallet in one transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        phone: data.phone,
        emailVerifyToken,
        wallet: { create: { balanceNgn: 0 } },
      },
    });
    return newUser;
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_REGISTER',
      metadata: { email: user.email },
    },
  });

  logger.info(`New user registered: ${user.email}`);

  // Fire-and-forget welcome email
  Email.sendWelcomeEmail(user.email, user.firstName).catch((err) => {
    logger.warn(`Failed to send welcome email to ${user.email}: ${err.message}`);
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerifyToken,
  };
};

// ─── Email Verification ───────────────────────────────

export const verifyEmail = async (token: string) => {
  const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });
  if (!user) throw new BadRequestError('Invalid or expired verification token.');
  if (user.emailVerified) throw new BadRequestError('Email already verified.');

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, status: 'ACTIVE' },
  });

  return { message: 'Email verified successfully.' };
};

// ─── Login ────────────────────────────────────────────

export const loginUser = async (
  email: string,
  password: string,
  totpCode?: string,
  ipAddress?: string,
  userAgent?: string
) => {
  // Find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid email or password.');

  // Check password
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    await prisma.auditLog.create({
      data: { action: 'USER_LOGIN', metadata: { email, success: false, reason: 'bad_password' }, ipAddress },
    });
    throw new UnauthorizedError('Invalid email or password.');
  }

  // Check account status
  if (user.status === 'SUSPENDED') {
    throw new UnauthorizedError('Your account has been suspended. Please contact support.');
  }

  // Check 2FA
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      return { requiresTwoFactor: true };
    }
    const totp = new OTPAuth.TOTP({
      issuer: process.env.TOTP_ISSUER || 'CertPortal',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret!),
    });
    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      // Check backup codes
      const backupValid = await verifyBackupCode(user.id, totpCode);
      if (!backupValid) throw new UnauthorizedError('Invalid authenticator code.');
    }
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id);

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  // Create session
  await prisma.session.create({
    data: { userId: user.id, ipAddress, userAgent, expiresAt },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'USER_LOGIN',
      userId: user.id,
      metadata: { success: true },
      ipAddress,
      userAgent,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      emailVerified: user.emailVerified,
      darkMode: user.darkMode,
    },
  };
};

// ─── Refresh Token ────────────────────────────────────

export const refreshAccessToken = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new UnauthorizedError('User not found.');

  const newAccessToken = generateAccessToken(user.id, user.role);
  return {
    accessToken: newAccessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      emailVerified: user.emailVerified,
      darkMode: user.darkMode,
    },
  };
};

// ─── Logout ───────────────────────────────────────────

export const logoutUser = async (userId: string, refreshToken?: string) => {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  await prisma.auditLog.create({
    data: { action: 'USER_LOGOUT', userId },
  });
};

// ─── 2FA Setup ────────────────────────────────────────

export const setup2FA = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found.');
  // Allow re-setup if 2FA was started but never verified (twoFactorEnabled = false)
  // Only block if fully enabled
  if (user.twoFactorEnabled) throw new BadRequestError('2FA is already enabled. Disable it first to reconfigure.');

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: process.env.TOTP_ISSUER || 'CertPortal',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const otpAuthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  // Store secret temporarily (not enabled until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret.base32 },
  });

  return { secret: secret.base32, qrCode: qrCodeDataUrl, otpAuthUrl };
};

export const verify2FA = async (userId: string, totpCode: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorSecret) throw new BadRequestError('2FA setup not initiated.');

  const totp = new OTPAuth.TOTP({
    issuer: process.env.TOTP_ISSUER || 'CertPortal',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
  });

  const delta = totp.validate({ token: totpCode, window: 1 });
  if (delta === null) throw new BadRequestError('Invalid authenticator code. Please try again.');

  // Generate backup codes
  const backupCodes = Array.from({ length: 8 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );
  const hashedBackupCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, backupCodes: hashedBackupCodes },
  });

  await prisma.auditLog.create({
    data: { action: 'USER_2FA_ENABLED', userId },
  });

  return { backupCodes }; // Show these ONCE to the user
};

export const disable2FA = async (userId: string, totpCode: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled) throw new BadRequestError('2FA is not enabled.');

  const totp = new OTPAuth.TOTP({
    issuer: process.env.TOTP_ISSUER || 'CertPortal',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret!),
  });

  const delta = totp.validate({ token: totpCode, window: 1 });
  if (delta === null) throw new BadRequestError('Invalid authenticator code.');

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] },
  });

  await prisma.auditLog.create({
    data: { action: 'USER_2FA_DISABLED', userId },
  });

  return { message: '2FA disabled successfully.' };
};

// ─── Password Reset ───────────────────────────────────

export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success (don't reveal if email exists)
  if (!user) return { message: 'If this email exists, a reset link has been sent.' };

  const resetToken = uuidv4();
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: resetToken, passwordResetExpiry: expiry },
  });

  logger.info(`Password reset requested for: ${email}`);
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  Email.sendPasswordResetEmail(user.email, user.firstName, resetUrl);

  return { message: 'If this email exists, a reset link has been sent.' };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiry: { gt: new Date() },
    },
  });
  if (!user) throw new BadRequestError('Invalid or expired reset token.');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
  });

  // Revoke all refresh tokens for security
  await prisma.refreshToken.updateMany({
    where: { userId: user.id },
    data: { revoked: true },
  });

  await prisma.auditLog.create({
    data: { action: 'PASSWORD_CHANGED', userId: user.id },
  });

  return { message: 'Password reset successfully.' };
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found.');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new BadRequestError('Current password is incorrect.');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.auditLog.create({
    data: { action: 'PASSWORD_CHANGED', userId },
  });

  return { message: 'Password changed successfully.' };
};

// ─── Backup Codes ─────────────────────────────────────

const verifyBackupCode = async (userId: string, code: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.backupCodes.length) return false;

  for (let i = 0; i < user.backupCodes.length; i++) {
    const valid = await bcrypt.compare(code.toUpperCase(), user.backupCodes[i]);
    if (valid) {
      // Remove used backup code
      const updatedCodes = user.backupCodes.filter((_, idx) => idx !== i);
      await prisma.user.update({ where: { id: userId }, data: { backupCodes: updatedCodes } });
      return true;
    }
  }
  return false;
};
