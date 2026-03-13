import { logOrderStatus } from '../utils/orderHistory';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import dns from 'dns/promises';
import { issueCertificate } from './issuance.service';

// ─── Helpers ──────────────────────────────────────────

const generateToken = () => crypto.randomBytes(20).toString('hex');

const getValidationEmails = (domain: string): string[] => {
  const base = domain.replace(/^\*\./, ''); // strip wildcard
  return [
    `admin@${base}`,
    `administrator@${base}`,
    `hostmaster@${base}`,
    `postmaster@${base}`,
    `webmaster@${base}`,
  ];
};

// ─── Initialize Validation ────────────────────────────

export const initializeValidation = async (
  orderId: string,
  userId: string,
  method: 'EMAIL' | 'DNS_TXT' | 'DNS_CNAME' | 'HTTP_FILE',
  validationEmail?: string
) => {
  // Verify order belongs to user
  const order = await prisma.certificateOrder.findFirst({
    where: { id: orderId, userId },
    include: { domainValidations: true },
  });
  if (!order) throw new NotFoundError('Order not found.');
  if (!['PAID', 'PENDING_VALIDATION'].includes(order.status)) {
    throw new BadRequestError('This order is not ready for domain validation.');
  }

  if (!order.commonName) throw new BadRequestError('Order has no domain name.');
  const domain: string = order.commonName!;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Cancel any existing pending validation for this order+domain
  await prisma.domainValidation.updateMany({
    where: { orderId, domain: domain ?? undefined, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: { status: 'FAILED' },
  });

  // Build method-specific fields
  let dnsRecord: string | null = null;
  let httpFilePath: string | null = null;
  let httpFileContent: string | null = null;
  let emailAddress: string | null = null;

  const baseDomain = domain.replace(/^\*\./, '');

  if (method === 'DNS_TXT') {
    dnsRecord = `_certportal-challenge.${baseDomain}`;
  } else if (method === 'DNS_CNAME') {
    dnsRecord = `_certportal-challenge.${baseDomain}`;
  } else if (method === 'HTTP_FILE') {
    httpFilePath = `/.well-known/pki-validation/${token}.txt`;
    httpFileContent = `${token}\ncertportal.com\n${baseDomain}`;
  } else if (method === 'EMAIL') {
    const validEmails = getValidationEmails(baseDomain);
    emailAddress = validationEmail && validEmails.includes(validationEmail)
      ? validationEmail
      : validEmails[0];
  }

  // Create validation record
  const validation = await prisma.domainValidation.create({
    data: {
      orderId,
      domain,
      method: method as any,
      status: 'PENDING',
      token,
      dnsRecord,
      httpFilePath,
      httpFileContent,
      validationEmail: emailAddress,
      expiresAt,
    },
  });

  // Update order status
  const prevOrder1 = await prisma.certificateOrder.findUnique({ where: { id: orderId }, select: { status: true } });
  await prisma.certificateOrder.update({
    where: { id: orderId },
    data: { status: 'PENDING_VALIDATION' },
  });
  await logOrderStatus(orderId, prevOrder1?.status as any, 'PENDING_VALIDATION', {
    reason: `Domain validation initiated via ${method} method`,
    note: `Domain: ${domain}`,
    changedBy: 'system',
  });

  logger.info(`Validation initialized: ${method} for ${domain} (order ${orderId})`);

  return {
    validation,
    instructions: buildInstructions(method, domain, token, dnsRecord, httpFilePath, httpFileContent, emailAddress),
  };
};

// ─── Build Instructions ───────────────────────────────

const buildInstructions = (
  method: string,
  domain: string,
  token: string,
  dnsRecord: string | null,
  httpFilePath: string | null,
  httpFileContent: string | null,
  emailAddress: string | null
) => {
  const baseDomain = domain.replace(/^\*\./, '');

  switch (method) {
    case 'DNS_TXT':
      return {
        method: 'DNS TXT Record',
        steps: [
          'Log into your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.)',
          'Navigate to the DNS management section for your domain',
          'Add a new TXT record with the following details:',
          'Wait for DNS propagation (usually 5–30 minutes)',
          'Click "Check Validation" below once the record is live',
        ],
        record: {
          type: 'TXT',
          name: `_certportal-challenge.${baseDomain}`,
          value: token,
          ttl: '300',
        },
      };

    case 'DNS_CNAME':
      return {
        method: 'DNS CNAME Record',
        steps: [
          'Log into your DNS provider',
          'Navigate to the DNS management section for your domain',
          'Add a new CNAME record with the following details:',
          'Wait for DNS propagation (usually 5–30 minutes)',
          'Click "Check Validation" below once the record is live',
        ],
        record: {
          type: 'CNAME',
          name: `_certportal-challenge.${baseDomain}`,
          value: `${token}.dcv.certportal.com`,
          ttl: '300',
        },
      };

    case 'HTTP_FILE':
      return {
        method: 'HTTP File Upload',
        steps: [
          `Create the directory path on your web server: .well-known/pki-validation/`,
          `Create a file named: ${token}.txt`,
          'Paste the exact content shown below into the file',
          `Make sure the file is accessible at: http://${baseDomain}${httpFilePath}`,
          'Click "Check Validation" below once the file is live',
        ],
        file: {
          path: httpFilePath,
          url: `http://${baseDomain}${httpFilePath}`,
          content: httpFileContent,
        },
      };

    case 'EMAIL':
      return {
        method: 'Email Validation',
        steps: [
          `An email has been sent to: ${emailAddress}`,
          'Open the email and click the verification link',
          'The link will automatically validate your domain',
          'Check your spam folder if you don\'t see the email within 5 minutes',
        ],
        email: emailAddress,
        note: 'Email validation is processed manually and may take up to 1 business day.',
      };

    default:
      return {};
  }
};

// ─── Get Validations for Order ────────────────────────

export const getValidations = async (orderId: string, userId: string) => {
  const order = await prisma.certificateOrder.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) throw new NotFoundError('Order not found.');

  const validations = await prisma.domainValidation.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });

  return validations.map((v) => ({
    ...v,
    instructions: buildInstructions(
      v.method as string,
      v.domain,
      v.token || '',
      v.dnsRecord,
      v.httpFilePath,
      v.httpFileContent,
      v.validationEmail
    ),
  }));
};

// ─── Check / Verify Validation ────────────────────────

export const checkValidation = async (validationId: string, userId: string) => {
  const validation = await prisma.domainValidation.findUnique({
    where: { id: validationId },
    include: { order: true },
  });
  if (!validation) throw new NotFoundError('Validation record not found.');
  if (validation.order.userId !== userId) throw new ForbiddenError('Access denied.');
  if (validation.status === 'VALIDATED') return { status: 'VALIDATED', message: 'Domain already validated.' };
  if (validation.status === 'EXPIRED') throw new BadRequestError('Validation has expired. Please start a new one.');

  // Update attempt counter
  await prisma.domainValidation.update({
    where: { id: validationId },
    data: { attempts: { increment: 1 }, lastCheckedAt: new Date(), status: 'IN_PROGRESS' },
  });

  let verified = false;
  let checkResult = '';

  try {
    if (validation.method === 'DNS_TXT') {
      verified = await checkDnsTxt(validation.domain, validation.token!);
      checkResult = verified ? 'TXT record found and matches.' : 'TXT record not found or does not match yet.';
    } else if (validation.method === 'DNS_CNAME') {
      verified = await checkDnsCname(validation.domain, validation.token!);
      checkResult = verified ? 'CNAME record found and matches.' : 'CNAME record not found or does not match yet.';
    } else if (validation.method === 'HTTP_FILE') {
      verified = await checkHttpFile(validation.domain, validation.httpFilePath!, validation.token!);
      checkResult = verified ? 'Validation file found and content matches.' : 'File not accessible or content does not match yet.';
    } else if (validation.method === 'EMAIL') {
      // Email is validated manually — just return pending
      return {
        status: 'PENDING',
        message: 'Email validation is processed manually. Please check your email and click the link.',
      };
    }
  } catch (err) {
    logger.warn(`Validation check error for ${validationId}:`, err);
    checkResult = 'Check failed due to a network error. Please try again.';
  }

  if (verified) {
    // Mark validated
    await prisma.domainValidation.update({
      where: { id: validationId },
      data: { status: 'VALIDATED', validatedAt: new Date() },
    });

    // Check if ALL domains on this order are validated
    const allValidations = await prisma.domainValidation.findMany({
      where: { orderId: validation.orderId },
    });
    const allValidated = allValidations.every((v) =>
      v.id === validationId ? true : v.status === 'VALIDATED'
    );

    if (allValidated) {
      await prisma.certificateOrder.update({
        where: { id: validation.orderId },
        data: { status: 'PENDING_ISSUANCE' },
      });
      await logOrderStatus(validation.orderId, 'VALIDATING', 'PENDING_ISSUANCE', {
        reason: 'Domain validation completed successfully',
        changedBy: 'system',
      });

      // Auto-issue certificate in background
      issueCertificate(validation.orderId).catch((err) =>
        logger.error(`Auto-issuance failed for order ${validation.orderId}:`, err)
      );
    }

    logger.info(`Domain validated: ${validation.domain} via ${validation.method}`);
    return { status: 'VALIDATED', message: checkResult };
  }

  return { status: 'PENDING', message: checkResult };
};

// ─── DNS TXT Check ────────────────────────────────────

const checkDnsTxt = async (domain: string, token: string): Promise<boolean> => {
  const baseDomain = domain.replace(/^\*\./, '');
  const lookupDomain = `_certportal-challenge.${baseDomain}`;

  try {
    const records = await dns.resolveTxt(lookupDomain);
    return records.some((r) => r.join('').includes(token));
  } catch {
    return false;
  }
};

// ─── DNS CNAME Check ──────────────────────────────────

const checkDnsCname = async (domain: string, token: string): Promise<boolean> => {
  const baseDomain = domain.replace(/^\*\./, '');
  const lookupDomain = `_certportal-challenge.${baseDomain}`;
  const expectedTarget = `${token}.dcv.certportal.com`;

  try {
    const records = await dns.resolveCname(lookupDomain);
    return records.some((r) => r.toLowerCase() === expectedTarget.toLowerCase());
  } catch {
    return false;
  }
};

// ─── HTTP File Check ──────────────────────────────────

const checkHttpFile = async (domain: string, filePath: string, token: string): Promise<boolean> => {
  const baseDomain = domain.replace(/^\*\./, '');
  const url = `http://${baseDomain}${filePath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return false;
    const content = await response.text();
    return content.trim().startsWith(token);
  } catch {
    return false;
  }
};

// ─── Admin: Manually Validate ─────────────────────────

export const adminValidateDomain = async (adminId: string, validationId: string) => {
  const validation = await prisma.domainValidation.findUnique({
    where: { id: validationId },
    include: { order: true },
  });
  if (!validation) throw new NotFoundError('Validation not found.');

  await prisma.domainValidation.update({
    where: { id: validationId },
    data: { status: 'VALIDATED', validatedAt: new Date() },
  });

  // Check if all validated
  const allValidations = await prisma.domainValidation.findMany({
    where: { orderId: validation.orderId },
  });
  const allValidated = allValidations.every((v) =>
    v.id === validationId ? true : v.status === 'VALIDATED'
  );
  if (allValidated) {
    await prisma.certificateOrder.update({
      where: { id: validation.orderId },
      data: { status: 'PENDING_ISSUANCE' },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      resourceId: validationId,
      metadata: { action: 'manual_domain_validation', domain: validation.domain },
    },
  });

  return { message: `Domain ${validation.domain} manually validated.` };
};
