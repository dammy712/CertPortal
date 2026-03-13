import { Request, Response, NextFunction } from 'express';
import * as WalletService from '../services/wallet.service';
import { sendSuccess, sendBadRequest } from '../utils/response';

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = await WalletService.getWallet(req.user!.userId);
    return sendSuccess(res, wallet, 'Wallet retrieved.');
  } catch (error) { next(error); }
};

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string | undefined;
    const result = await WalletService.getTransactions(req.user!.userId, page, limit, type);
    return sendSuccess(res, result.transactions, 'Transactions retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

export const initializePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount)) return sendBadRequest(res, 'Valid amount is required.');
    const result = await WalletService.initializePayment(req.user!.userId, Number(amount));
    return sendSuccess(res, result, 'Payment initialized.');
  } catch (error) { next(error); }
};

export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference } = req.params;
    const result = await WalletService.verifyPayment(reference);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};

export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string || '';
    // req.body is a Buffer when using express.raw()
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    await WalletService.handleWebhook(payload, signature);
    // Paystack expects 200 quickly
    res.status(200).json({ received: true });
  } catch (error) { next(error); }
};

export const adminAdjustWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || !description) return sendBadRequest(res, 'userId, amount and description are required.');
    const result = await WalletService.adminAdjustWallet(req.user!.userId, userId, Number(amount), description);
    return sendSuccess(res, result, 'Wallet adjusted successfully.');
  } catch (error) { next(error); }
};

// ─── Module 21: Invoice & Statement ──────────────────

export const getInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const html = await WalletService.getTransactionInvoice(req.user!.userId, req.params.transactionId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
};

export const getStatement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, page, limit, format } = req.query as Record<string, string>;
    const result = await WalletService.getStatement(req.user!.userId, {
      from, to, format,
      page:  page  ? Number(page)  : 1,
      limit: limit ? Number(limit) : 50,
    });

    if (format === 'csv') {
      const { csv, total } = result as { csv: string; total: number };
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      return sendSuccess(res, result, 'Statement retrieved.');
    }
  } catch (e) { next(e); }
};
