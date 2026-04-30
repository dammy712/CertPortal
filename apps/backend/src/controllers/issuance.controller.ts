import { Request, Response, NextFunction } from 'express';
import * as IssuanceService from '../services/issuance.service';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';

export const getCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await IssuanceService.getCertificate(req.params.orderId, req.user!.userId);
    return sendSuccess(res, result, 'Certificate retrieved.');
  } catch (error) { next(error); }
};

export const listCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await IssuanceService.listCertificates(req.user!.userId, {
      page:        parseInt(q.page as string) || 1,
      limit:       parseInt(q.limit as string) || 10,
      status:      q.status as string,
      search:      q.search as string,
      productType: q.productType as string,
      expiryFrom:  q.expiryFrom as string,
      expiryTo:    q.expiryTo as string,
      dateFrom:    q.dateFrom as string,
      dateTo:      q.dateTo as string,
    });
    return sendSuccess(res, result.certificates, 'Certificates retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

export const downloadCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileType = (req.query.type as string) || 'cert';
    if (!['cert', 'chain', 'fullchain'].includes(fileType)) {
      return sendBadRequest(res, 'type must be cert, chain, or fullchain.');
    }

    const result = await IssuanceService.downloadCertificate(
      req.params.id,
      req.user!.userId,
      fileType as any
    );

    // Stream the file directly — avoids localhost URL issues and auth problems
    const fs = await import('fs');
    const path = await import('path');

    // result.url is like "/uploads/certs/abc123.crt" or "http://localhost:5000/uploads/..."
    // Extract just the file key portion and resolve to disk path
    const urlPath = result.url.replace(/^https?:\/\/[^/]+/, ''); // strip host if present
    const filePath = path.join(process.cwd(), urlPath.startsWith('/') ? urlPath.slice(1) : urlPath);

    if (!fs.existsSync(filePath)) {
      return sendBadRequest(res, 'Certificate file not found on server.');
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileName    = result.fileName || `certificate-${fileType}.crt`;

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileContent);

  } catch (error) { next(error); }
};

export const adminIssueCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await IssuanceService.adminIssueCertificate(req.user!.userId, req.params.orderId);
    return sendCreated(res, result, 'Certificate issued successfully.');
  } catch (error) { next(error); }
};

// Customer-triggered immediate CA status poll
export const checkCAStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;

    // Verify order belongs to this user
    const { prisma } = await import('../utils/prisma');
    const order = await prisma.certificateOrder.findFirst({
      where: { id: orderId, userId: req.user!.userId },
      select: { id: true, status: true, caOrderId: true },
    });

    if (!order) return next(new (await import('../utils/errors')).NotFoundError('Order not found.'));

    if (order.status === 'ISSUED') {
      const cert = await IssuanceService.getCertificate(orderId, req.user!.userId);
      return sendSuccess(res, { status: 'issued', certificate: cert }, 'Certificate is ready.');
    }

    if (!order.caOrderId) {
      // Not yet submitted — try submitting now
      const result = await IssuanceService.issueCertificate(orderId);
      return sendSuccess(res, { status: 'submitted', ...result }, 'Submitted to CA.');
    }

    // Already submitted — poll for latest status
    const caStatus = await IssuanceService.pollCAStatus(orderId);

    if (caStatus.status === 'issued') {
      const cert = await IssuanceService.getCertificate(orderId, req.user!.userId);
      return sendSuccess(res, { status: 'issued', certificate: cert }, 'Certificate is ready!');
    }

    return sendSuccess(res, {
      status: caStatus.status,
      caRawStatus: caStatus.caRawStatus,
      message: caStatus.status === 'processing'
        ? 'Certum is verifying your domain. Please check your domain admin email and click the verification link.'
        : 'Still processing. Check again in a few minutes.',
    }, 'Status checked.');

  } catch (e) { next(e); }
};
