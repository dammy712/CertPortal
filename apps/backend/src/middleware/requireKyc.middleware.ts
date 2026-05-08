import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { prisma } from '../utils/prisma';

/**
 * Middleware that blocks access to protected routes if the user's KYC
 * is not fully approved. Admins are exempt from this check.
 */
export const requireKyc = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next(new ForbiddenError('Authentication required.'));
      return;
    }

    // Admins and super admins bypass KYC check
    if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      next();
      return;
    }

    // Check if all submitted KYC documents are approved
    const documents = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status::text as status FROM kyc_documents WHERE "userId" = $1`,
      req.user.userId
    );

    const isApproved =
      documents.length > 0 && documents.every((d) => d.status === 'APPROVED');

    if (!isApproved) {
      next(
        new ForbiddenError(
          'KYC verification required. Please complete and submit your KYC documents and wait for admin approval before accessing this feature.'
        )
      );
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
