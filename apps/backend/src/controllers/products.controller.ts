import { Request, Response, NextFunction } from 'express';
import * as ProductsService from '../services/products.service';
import { sendSuccess, sendBadRequest } from '../utils/response';

// Public
export const listPublic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.listProducts(false);
    return sendSuccess(res, result, 'Products retrieved.');
  } catch (e) { next(e); }
};

// Admin
export const listAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.listProducts(true);
    return sendSuccess(res, result, 'Products retrieved.');
  } catch (e) { next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.getProduct(req.params.id);
    return sendSuccess(res, result, 'Product retrieved.');
  } catch (e) { next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.createProduct(req.user!.userId, req.body);
    return sendSuccess(res, result, 'Product created.', 201);
  } catch (e) { next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.updateProduct(req.user!.userId, req.params.id, req.body);
    return sendSuccess(res, result, 'Product updated.');
  } catch (e) { next(e); }
};

export const upsertPrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { validity, priceNgn, isActive } = req.body;
    if (!validity || priceNgn === undefined) return sendBadRequest(res, 'validity and priceNgn are required.');
    const result = await ProductsService.upsertPrice(req.user!.userId, req.params.id, validity, Number(priceNgn), isActive);
    return sendSuccess(res, result, 'Price updated.');
  } catch (e) { next(e); }
};

export const toggle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProductsService.toggleProduct(req.user!.userId, req.params.id);
    return sendSuccess(res, result, `Product ${result.isActive ? 'activated' : 'deactivated'}.`);
  } catch (e) { next(e); }
};
