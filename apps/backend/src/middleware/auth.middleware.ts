import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { prisma } from '../utils/prisma';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}

// ─── Authenticate JWT ─────────────────────────────────

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required.');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, status: true },
    });

    if (!user) throw new UnauthorizedError('User no longer exists.');
    if (user.status === 'SUSPENDED') throw new UnauthorizedError('Account suspended.');

    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
};

// ─── Role Guards ──────────────────────────────────────

export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required.'));
    return;
  }
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    next(new ForbiddenError('Admin access required.'));
    return;
  }
  next();
};

export const requireSuperAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    next(new ForbiddenError('Super admin access required.'));
    return;
  }
  next();
};

// ─── Optional Auth (doesn't fail if no token) ────────

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = verifyAccessToken(token);
      req.user = { userId: payload.userId, role: payload.role };
    }
  } catch {
    // Ignore auth errors for optional auth
  }
  next();
};
