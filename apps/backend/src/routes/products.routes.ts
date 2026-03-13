import { Router, Request, Response, NextFunction } from 'express';
import * as ProductsController from '../controllers/products.controller';
import { authenticate } from '../middleware/auth.middleware';
import { ForbiddenError } from '../utils/errors';

const router = Router();

// Public route - no auth needed
router.get('/', ProductsController.listPublic);
router.get('/:id', ProductsController.getOne);

// Admin routes
const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
};

router.post('/',               authenticate, requireAdmin, ProductsController.create);
router.patch('/:id',           authenticate, requireAdmin, ProductsController.update);
router.patch('/:id/toggle',    authenticate, requireAdmin, ProductsController.toggle);
router.put('/:id/prices',      authenticate, requireAdmin, ProductsController.upsertPrice);

export default router;
