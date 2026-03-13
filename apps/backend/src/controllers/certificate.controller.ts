import { Request, Response, NextFunction } from 'express';
import * as CertService from '../services/certificate.service';
import { sendSuccess, sendCreated, sendBadRequest } from '../utils/response';

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await CertService.getProducts();
    return sendSuccess(res, products, 'Products retrieved.');
  } catch (error) { next(error); }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await CertService.getProductById(req.params.id);
    return sendSuccess(res, product, 'Product retrieved.');
  } catch (error) { next(error); }
};

export const decodeCSR = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csr } = req.body;
    if (!csr) return sendBadRequest(res, 'CSR is required.');
    const decoded = await CertService.decodeCSR(csr);
    return sendSuccess(res, decoded, 'CSR decoded successfully.');
  } catch (error) { next(error); }
};

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await CertService.createOrder(req.user!.userId, req.body);
    return sendCreated(res, order, 'Order placed successfully.');
  } catch (error) { next(error); }
};

export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      status: req.query.status as string,
      productType: req.query.productType as string,
      search: req.query.search as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    };
    const result = await CertService.getOrders(req.user!.userId, filters);
    return sendSuccess(res, result.orders, 'Orders retrieved.', 200, result.meta);
  } catch (error) { next(error); }
};

export const getOrderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await CertService.getOrderById(req.params.id, req.user!.userId);
    return sendSuccess(res, order, 'Order retrieved.');
  } catch (error) { next(error); }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CertService.cancelOrder(req.params.id, req.user!.userId);
    return sendSuccess(res, result, result.message);
  } catch (error) { next(error); }
};
