import { prisma } from './prisma';
import { OrderStatus } from '@prisma/client';

/**
 * Log every order status transition.
 * Call this wherever order status changes.
 */
export const logOrderStatus = async (
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  options?: { reason?: string; note?: string; changedBy?: string }
) => {
  try {
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        reason:    options?.reason,
        note:      options?.note,
        changedBy: options?.changedBy || 'system',
      },
    });
  } catch (err) {
    // Never throw — history logging must not break the main flow
    console.error('[OrderHistory] Failed to log status:', err);
  }
};

/**
 * Human-readable labels and descriptions for each status
 */
export const STATUS_META: Record<OrderStatus, { label: string; desc: string; color: string }> = {
  PENDING_PAYMENT: { label: 'Pending Payment',    desc: 'Awaiting wallet payment',                    color: 'gray' },
  PAID:            { label: 'Payment Received',   desc: 'Payment confirmed, preparing validation',    color: 'blue' },
  PENDING_VALIDATION: { label: 'Domain Validation', desc: 'Waiting for domain ownership verification', color: 'yellow' },
  VALIDATING:      { label: 'Validating',         desc: 'Domain validation in progress',              color: 'yellow' },
  PENDING_ISSUANCE: { label: 'Issuing Certificate', desc: 'Certificate authority is issuing',          color: 'purple' },
  ISSUED:          { label: 'Certificate Issued', desc: 'Certificate ready to download',              color: 'green' },
  CANCELLED:       { label: 'Cancelled',          desc: 'Order was cancelled',                        color: 'red' },
  REFUNDED:        { label: 'Refunded',           desc: 'Payment refunded to wallet',                 color: 'orange' },
  EXPIRED:         { label: 'Expired',            desc: 'Order expired without completion',           color: 'gray' },
};
