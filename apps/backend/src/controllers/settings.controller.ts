import { Request, Response, NextFunction } from 'express';
import * as SettingsService from '../services/settings.service';
import { sendSuccess, sendBadRequest } from '../utils/response';
import { prisma } from '../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export const getInvoiceSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.getInvoiceSettings();
    return sendSuccess(res, settings, 'Invoice settings retrieved.');
  } catch (e) { next(e); }
};

export const saveInvoiceSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.saveInvoiceSettings(req.user!.userId, req.body);
    return sendSuccess(res, settings, 'Invoice settings saved.');
  } catch (e) { next(e); }
};

// ─── Pricing / Exchange Rate ─────────────────────────

export const getPricingSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pricing = await SettingsService.getPricingSettings();
    return sendSuccess(res, pricing, 'Pricing settings retrieved.');
  } catch (e) { next(e); }
};

export const savePricingSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { usdToNgn, eurToNgn, plnToNgn, markupPercent } = req.body;

    if (usdToNgn !== undefined && (isNaN(usdToNgn) || usdToNgn <= 0)) {
      return sendBadRequest(res, 'USD to NGN rate must be a positive number.');
    }
    if (markupPercent !== undefined && (isNaN(markupPercent) || markupPercent < 0 || markupPercent > 500)) {
      return sendBadRequest(res, 'Markup percent must be between 0 and 500.');
    }

    const pricing = await SettingsService.savePricingSettings(req.user!.userId, {
      ...(usdToNgn !== undefined && { usdToNgn: Number(usdToNgn) }),
      ...(eurToNgn !== undefined && { eurToNgn: Number(eurToNgn) }),
      ...(plnToNgn !== undefined && { plnToNgn: Number(plnToNgn) }),
      ...(markupPercent !== undefined && { markupPercent: Number(markupPercent) }),
    });

    return sendSuccess(res, pricing, 'Pricing settings saved.');
  } catch (e) { next(e); }
};

// ─── Product Price Management ────────────────────────

export const updateProductPrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { prices } = req.body; // Array of { validity, priceNgn }

    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return sendBadRequest(res, 'prices array is required.');
    }

    const product = await prisma.certificateProduct.findUnique({
      where: { id: productId },
      include: { prices: true },
    });
    if (!product) return sendBadRequest(res, 'Product not found.');

    const validValidity = ['ONE_YEAR', 'TWO_YEARS', 'THREE_YEARS'];
    for (const p of prices) {
      if (!validValidity.includes(p.validity)) {
        return sendBadRequest(res, `Invalid validity: ${p.validity}`);
      }
      if (!p.priceNgn || Number(p.priceNgn) <= 0) {
        return sendBadRequest(res, 'Price must be greater than 0.');
      }
    }

    // Upsert each price record
    const updated = await Promise.all(prices.map(async (p: { validity: string; priceNgn: number }) => {
      const existing = product.prices.find(pr => pr.validity === p.validity);
      if (existing) {
        return prisma.productPrice.update({
          where: { id: existing.id },
          data: { priceNgn: new Decimal(p.priceNgn), isActive: true },
        });
      } else {
        return prisma.productPrice.create({
          data: {
            productId,
            validity: p.validity as any,
            priceNgn: new Decimal(p.priceNgn),
            isActive: true,
          },
        });
      }
    }));

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'ADMIN_ACTION',
        resourceId: productId,
        metadata: { action: 'update_prices', prices },
      },
    });

    return sendSuccess(res, updated, 'Product prices updated.');
  } catch (e) { next(e); }
};

