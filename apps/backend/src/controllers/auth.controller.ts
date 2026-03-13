import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';

// ─── Register ─────────────────────────────────────────

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.registerUser(req.body);
    return sendCreated(res, result, 'Account created successfully. Please verify your email.');
  } catch (error) {
    next(error);
  }
};

// ─── Verify Email ─────────────────────────────────────

export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const result = await AuthService.verifyEmail(token);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

// ─── Login ────────────────────────────────────────────

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, totpCode } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.loginUser(email, password, totpCode, ipAddress, userAgent);

    // If 2FA required, return early
    if ('requiresTwoFactor' in result) {
      return res.status(200).json({
        success: true,
        requiresTwoFactor: true,
        message: 'Two-factor authentication required.',
      });
    }

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return sendSuccess(res, {
      accessToken: result.accessToken,
      user: result.user,
    }, 'Login successful.');
  } catch (error) {
    next(error);
  }
};

// ─── Refresh Token ────────────────────────────────────

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return sendBadRequest(res, 'Refresh token required.');

    const result = await AuthService.refreshAccessToken(token);
    return sendSuccess(res, result, 'Token refreshed.');
  } catch (error) {
    next(error);
  }
};

// ─── Logout ───────────────────────────────────────────

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    await AuthService.logoutUser(req.user!.userId, refreshToken);

    res.clearCookie('refreshToken');
    return sendSuccess(res, null, 'Logged out successfully.');
  } catch (error) {
    next(error);
  }
};

// ─── Get Current User ─────────────────────────────────

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../utils/prisma');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
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
        organizationId: true,
        createdAt: true,
        wallet: { select: { balanceNgn: true } },
      },
    });
    return sendSuccess(res, user, 'User profile retrieved.');
  } catch (error) {
    next(error);
  }
};

// ─── 2FA Setup ────────────────────────────────────────

export const setup2FA = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.setup2FA(req.user!.userId);
    return sendSuccess(res, result, '2FA setup initiated. Scan the QR code with your authenticator app.');
  } catch (error) {
    next(error);
  }
};

export const verify2FA = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { totpCode } = req.body;
    const result = await AuthService.verify2FA(req.user!.userId, totpCode);
    return sendSuccess(res, result, '2FA enabled successfully. Save your backup codes in a safe place.');
  } catch (error) {
    next(error);
  }
};

export const disable2FA = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { totpCode } = req.body;
    const result = await AuthService.disable2FA(req.user!.userId, totpCode);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

// ─── Password Management ──────────────────────────────

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const result = await AuthService.requestPasswordReset(email);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    const result = await AuthService.resetPassword(token, password);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(req.user!.userId, currentPassword, newPassword);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};
