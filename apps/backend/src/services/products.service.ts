import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '../utils/logger';

const VALID_TYPES = ['DV','DV_MULTIDOMAIN','DV_WILDCARD','OV','OV_MULTIDOMAIN','OV_WILDCARD','EV','EV_MULTIDOMAIN'];
const VALID_VALIDITY = ['ONE_YEAR','TWO_YEARS','THREE_YEARS'];

// ─── List all products (admin sees inactive too) ──────

export const listProducts = async (includeInactive = false) => {
  return prisma.certificateProduct.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      prices: { orderBy: { validity: 'asc' } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
};

// ─── Get one product ──────────────────────────────────

export const getProduct = async (id: string) => {
  const product = await prisma.certificateProduct.findUnique({
    where: { id },
    include: {
      prices: { orderBy: { validity: 'asc' } },
      _count: { select: { orders: true } },
    },
  });
  if (!product) throw new NotFoundError('Product not found.');
  return product;
};

// ─── Create product ───────────────────────────────────

export const createProduct = async (
  adminId: string,
  data: {
    name: string;
    type: string;
    description?: string;
    maxSans?: number;
    supportsWildcard?: boolean;
    prices: Array<{ validity: string; priceNgn: number }>;
  }
) => {
  if (!data.name?.trim()) throw new BadRequestError('Product name is required.');
  if (!VALID_TYPES.includes(data.type)) throw new BadRequestError('Invalid certificate type.');
  if (!data.prices?.length) throw new BadRequestError('At least one price is required.');

  for (const p of data.prices) {
    if (!VALID_VALIDITY.includes(p.validity)) throw new BadRequestError(`Invalid validity: ${p.validity}`);
    if (!p.priceNgn || p.priceNgn <= 0) throw new BadRequestError('Price must be greater than 0.');
  }

  const product = await prisma.certificateProduct.create({
    data: {
      name: data.name.trim(),
      type: data.type as any,
      description: data.description?.trim(),
      maxSans: data.maxSans ?? 1,
      supportsWildcard: data.supportsWildcard ?? false,
      isActive: true,
      prices: {
        create: data.prices.map((p) => ({
          validity: p.validity as any,
          priceNgn: new Decimal(p.priceNgn),
          isActive: true,
        })),
      },
    },
    include: { prices: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'product_created', productId: product.id, name: product.name },
    },
  });

  logger.info(`Product created: ${product.name} by admin ${adminId}`);
  return product;
};

// ─── Update product ───────────────────────────────────

export const updateProduct = async (
  adminId: string,
  productId: string,
  data: {
    name?: string;
    description?: string;
    maxSans?: number;
    supportsWildcard?: boolean;
    isActive?: boolean;
  }
) => {
  const existing = await prisma.certificateProduct.findUnique({ where: { id: productId } });
  if (!existing) throw new NotFoundError('Product not found.');

  const updated = await prisma.certificateProduct.update({
    where: { id: productId },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.maxSans !== undefined && { maxSans: data.maxSans }),
      ...(data.supportsWildcard !== undefined && { supportsWildcard: data.supportsWildcard }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    include: { prices: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'product_updated', productId, changes: data },
    },
  });

  return updated;
};

// ─── Update price ─────────────────────────────────────

export const upsertPrice = async (
  adminId: string,
  productId: string,
  validity: string,
  priceNgn: number,
  isActive = true
) => {
  if (!VALID_VALIDITY.includes(validity)) throw new BadRequestError('Invalid validity period.');
  if (priceNgn <= 0) throw new BadRequestError('Price must be greater than 0.');

  const product = await prisma.certificateProduct.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product not found.');

  const price = await prisma.productPrice.upsert({
    where: { productId_validity: { productId, validity: validity as any } },
    update: { priceNgn: new Decimal(priceNgn), isActive },
    create: { productId, validity: validity as any, priceNgn: new Decimal(priceNgn), isActive },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'price_updated', productId, validity, priceNgn },
    },
  });

  return price;
};

// ─── Toggle product active state ──────────────────────

export const toggleProduct = async (adminId: string, productId: string) => {
  const product = await prisma.certificateProduct.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product not found.');

  const updated = await prisma.certificateProduct.update({
    where: { id: productId },
    data: { isActive: !product.isActive },
    include: { prices: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      metadata: { action: 'product_toggled', productId, isActive: updated.isActive },
    },
  });

  return updated;
};
