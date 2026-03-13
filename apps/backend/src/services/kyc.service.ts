import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { uploadFile, getSignedUrl, deleteFile, validateFile } from '../utils/fileUpload';
import { logger } from '../utils/logger';

// ─── Derive KYC status from documents ────────────────

const deriveKycStatus = (docs: Array<{ status: string }>) => {
  if (docs.length === 0) return 'NOT_STARTED';
  if (docs.every((d) => d.status === 'APPROVED')) return 'APPROVED';
  if (docs.some((d) => d.status === 'REJECTED')) return 'REJECTED';
  if (docs.some((d) => d.status === 'APPROVED')) return 'UNDER_REVIEW';
  return 'PENDING';
};

// ─── Get KYC Status ───────────────────────────────────

export const getKycStatus = async (userId: string) => {
  // Use raw query to avoid Prisma enum validation issues with extended DocumentType values
  const documents = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, "documentType"::text as "documentType", "fileName", "fileSize", "mimeType",
      status::text as status, "reviewNotes", "createdAt", "reviewedAt"
     FROM kyc_documents
     WHERE "userId" = $1
     ORDER BY "createdAt" DESC`,
    userId
  );

  return {
    kycStatus: deriveKycStatus(documents),
    documents,
  };
};

// ─── Upload Document ──────────────────────────────────

export const uploadDocument = async (
  userId: string,
  documentType: string,
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }
) => {
  const validation = validateFile(file.mimetype, file.size, 10);
  if (!validation.valid) throw new BadRequestError(validation.error!);

  const validTypes = [
    'NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE',
    'UTILITY_BILL', 'BANK_STATEMENT', 'CAC_CERTIFICATE',
    'CAC_FORM_CO7', 'OTHER',
  ];
  if (!validTypes.includes(documentType)) {
    throw new BadRequestError('Invalid document type.');
  }

  // Check if pending/approved doc of same type already exists
  // Use raw query to bypass Prisma enum validation for extended document types
  const existingRows = await prisma.$queryRaw<any[]>`
    SELECT id, status FROM kyc_documents
    WHERE "userId" = ${userId}
    AND "documentType"::text = ${documentType}
    AND status::text IN ('PENDING', 'APPROVED')
    LIMIT 1
  `;
  const existing = existingRows[0] || null;
  if (existing) {
    throw new BadRequestError(
      `You already have a ${existing.status.toLowerCase()} ${documentType.replace(/_/g, ' ')} document. Please wait for review or delete it first.`
    );
  }

  // Upload file
  const { key, size } = await uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    `kyc/${userId}`
  );

  // Save to DB — use raw insert to bypass Prisma enum validation
  const docId = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO kyc_documents (id, "userId", "documentType", "fileName", "fileKey", "fileSize", "mimeType", status, "createdAt", "updatedAt")
    VALUES (${docId}::uuid, ${userId}::uuid, ${documentType}::"DocumentType", ${file.originalname}, ${key}, ${size}, ${file.mimetype}, 'PENDING'::"KycStatus", NOW(), NOW())
  `;
  const document = await prisma.kycDocument.findUnique({ where: { id: docId } });
  if (!document) throw new Error('Failed to save KYC document.');

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'KYC_SUBMITTED',
      resourceId: document.id,
      metadata: { documentType, fileName: file.originalname },
    },
  });

  logger.info(`KYC document uploaded: ${documentType} for user ${userId}`);
  return document;
};

// ─── Get Document Signed URL ──────────────────────────

export const getDocumentUrl = async (documentId: string, userId: string, isAdmin = false) => {
  const document = await prisma.kycDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError('Document not found.');
  if (!isAdmin && document.userId !== userId) throw new ForbiddenError('Access denied.');

  const signedUrl = await getSignedUrl(document.fileKey);
  return { url: signedUrl, expiresIn: 3600 };
};

// ─── Delete Document ──────────────────────────────────

export const deleteDocument = async (documentId: string, userId: string) => {
  const document = await prisma.kycDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError('Document not found.');
  if (document.userId !== userId) throw new ForbiddenError('Access denied.');
  if (document.status === 'APPROVED') {
    throw new BadRequestError('Approved documents cannot be deleted.');
  }

  await deleteFile(document.fileKey);
  await prisma.kycDocument.delete({ where: { id: documentId } });

  return { message: 'Document deleted successfully.' };
};

// ─── ADMIN: Get Pending KYC Reviews ───────────────────

export const getAdminKycQueue = async (page = 1, limit = 20, status?: string) => {
  const where: any = {};
  where.status = status || 'PENDING';

  const statusFilter = (where.status as string) || 'PENDING';
  const offset = (page - 1) * limit;

  const [documents, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT k.id, k."documentType"::text as "documentType", k."fileName", k."fileSize",
        k."mimeType", k.status::text as status, k."reviewNotes",
        k."createdAt", k."reviewedAt", k."userId",
        json_build_object(
          'id', u.id, 'firstName', u."firstName", 'lastName', u."lastName",
          'email', u.email, 'status', u.status::text
        ) as user
       FROM kyc_documents k
       JOIN users u ON u.id = k."userId"
       WHERE k.status::text = $1
       ORDER BY k."createdAt" ASC
       LIMIT $2 OFFSET $3`,
      statusFilter, limit, offset
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM kyc_documents WHERE status::text = $1`,
      statusFilter
    ),
  ]);

  const total = countResult[0]?.count || 0;

  return {
    documents,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ─── ADMIN: Review Document ───────────────────────────

export const reviewDocument = async (
  adminId: string,
  documentId: string,
  decision: 'APPROVED' | 'REJECTED',
  note?: string
) => {
  const document = await prisma.kycDocument.findUnique({
    where: { id: documentId },
    include: { user: true },
  });
  if (!document) throw new NotFoundError('Document not found.');
  if (document.status !== 'PENDING') {
    throw new BadRequestError('This document has already been reviewed.');
  }

  await prisma.kycDocument.update({
    where: { id: documentId },
    data: {
      status: decision,
      reviewNotes: note,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    },
  });

  // Notify user
  await prisma.notification.create({
    data: {
      userId: document.userId,
      type: 'KYC_UPDATE',
      channel: 'IN_APP',
      title: decision === 'APPROVED' ? 'Document Approved ✅' : 'Document Requires Attention',
      message: decision === 'APPROVED'
        ? `Your ${document.documentType.replace(/_/g, ' ')} has been approved.`
        : `Your ${document.documentType.replace(/_/g, ' ')} was not accepted. ${note ? `Reason: ${note}` : 'Please resubmit.'}`,
      metadata: { documentId, decision, note },
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: decision === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED',
      resourceId: documentId,
      metadata: { targetUserId: document.userId, note },
    },
  });

  logger.info(`KYC document ${decision.toLowerCase()}: ${documentId} by admin ${adminId}`);
  return { message: `Document ${decision.toLowerCase()} successfully.` };
};
