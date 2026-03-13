import { Request, Response, NextFunction } from 'express';
import * as ConversionService from '../services/conversion.service';
import { sendSuccess, sendBadRequest } from '../utils/response';

// ─── POST /api/v1/convert ─────────────────────────────
// Accepts cert + optional key/chain, returns binary file download

export const convert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { certificate, privateKey, chain, targetFormat, pfxPassword } = req.body;

    if (!certificate) return sendBadRequest(res, 'Certificate (PEM) is required.');
    if (!targetFormat) return sendBadRequest(res, 'targetFormat is required.');

    const VALID_FORMATS = ['PFX', 'P7B', 'PEM', 'DER', 'CRT', 'CER'];
    if (!VALID_FORMATS.includes(targetFormat.toUpperCase())) {
      return sendBadRequest(res, `Invalid format. Supported: ${VALID_FORMATS.join(', ')}`);
    }

    const result = await ConversionService.convertCertificate({
      certificate,
      privateKey,
      chain,
      targetFormat: targetFormat.toUpperCase() as any,
      pfxPassword,
    });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.data.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(result.data);

  } catch (e) { next(e); }
};

// ─── POST /api/v1/convert/inspect ────────────────────
// Parse a cert PEM and return metadata for UI preview

export const inspect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { certificate } = req.body;
    if (!certificate) return sendBadRequest(res, 'Certificate (PEM) is required.');

    const info = await ConversionService.inspectCertificate(certificate);
    return sendSuccess(res, info, 'Certificate parsed.');
  } catch (e) { next(e); }
};
