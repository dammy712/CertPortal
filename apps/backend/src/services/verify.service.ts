import { prisma } from '../utils/prisma';
import { NotFoundError } from '../utils/errors';

// ─── Public Certificate Lookup ────────────────────────
// No authentication required — this is a public trust endpoint.

export const lookupCertificate = async (query: string) => {
  const q = query.trim();

  // Try serial number first, then thumbprint, then common name (exact)
  const cert = await prisma.certificate.findFirst({
    where: {
      OR: [
        { serialNumber: { equals: q,    mode: 'insensitive' } },
        { thumbprint:   { equals: q,    mode: 'insensitive' } },
        { commonName:   { equals: q,    mode: 'insensitive' } },
        { serialNumber: { contains: q,  mode: 'insensitive' } },
      ],
    },
    include: {
      order: {
        select: {
          orderNumber: true,
          validity:    true,
          product:     { select: { name: true, type: true } },
          user:        { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!cert) throw new NotFoundError('Certificate not found. Please check the serial number or thumbprint.');

  const now = new Date();
  const isRevoked = !!cert.revokedAt;
  const isExpired = cert.expiresAt < now;
  const daysLeft  = Math.ceil((cert.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const status = isRevoked ? 'revoked' : isExpired ? 'expired' : 'valid';

  // Return only public-safe fields — no user PII beyond first name
  return {
    status,
    isValid:   status === 'valid',
    isRevoked,
    isExpired,
    daysLeft:  isRevoked || isExpired ? 0 : daysLeft,

    certificate: {
      commonName:       cert.commonName,
      subjectAltNames:  cert.subjectAltNames,
      serialNumber:     cert.serialNumber,
      thumbprint:       cert.thumbprint,
      issuerName:       cert.issuerName,
      issuedAt:         cert.issuedAt,
      expiresAt:        cert.expiresAt,
      revokedAt:        cert.revokedAt,
    },

    product: {
      name: cert.order.product.name,
      type: cert.order.product.type,
    },

    issuedTo: cert.order.user
      ? `${cert.order.user.firstName} ${cert.order.user.lastName[0]}.`
      : 'Private',
  };
};
