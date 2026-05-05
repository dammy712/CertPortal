/**
 * cleanup-certs.ts
 * Run once to fix the duplicate certificate mess:
 *   npx ts-node cleanup-certs.ts
 *
 * What it does:
 * 1. Finds all orders that have more than one certificate record — keeps newest, deletes rest
 * 2. Deletes junk self-signed cert files from uploads/certificates/
 * 3. Resets any ISSUED orders that have no valid Certum cert back to PENDING_ISSUANCE
 *    so the CA poller will re-fetch the real cert
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'certificates');

async function main() {
  console.log('=== CertPortal Certificate Cleanup ===\n');

  // ── Step 1: Find duplicate certificate records per order ──
  const allCerts = await prisma.certificate.findMany({
    include: { order: { select: { orderNumber: true, caOrderId: true, userId: true } } },
    orderBy: { issuedAt: 'desc' },
  });

  const byOrder = new Map<string, typeof allCerts>();
  for (const cert of allCerts) {
    const existing = byOrder.get(cert.orderId) || [];
    existing.push(cert);
    byOrder.set(cert.orderId, existing);
  }

  let deletedCerts = 0;
  let deletedFiles = 0;

  for (const [orderId, certs] of byOrder.entries()) {
    if (certs.length <= 1) continue;

    // Keep newest, delete the rest
    const toDelete = certs.slice(1); // already sorted desc, so slice(1) = older ones
    console.log(`Order ${certs[0].order.orderNumber}: found ${certs.length} certs — deleting ${toDelete.length} duplicates`);

    for (const cert of toDelete) {
      // Delete files from disk
      for (const key of [cert.certFileKey, cert.chainFileKey]) {
        if (!key) continue;
        const filePath = path.join(process.cwd(), 'uploads', key);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedFiles++;
          console.log(`  Deleted file: ${key}`);
        }
      }
      // Delete DB record
      await prisma.certificate.delete({ where: { id: cert.id } });
      deletedCerts++;
    }
  }

  // ── Step 2: Find self-signed certs (issuerName = 'CertPortal Dev CA') ──
  // These were generated locally instead of from Certum — reset those orders
  const devCerts = await prisma.certificate.findMany({
    where: { issuerName: 'CertPortal Dev CA' },
    include: { order: { select: { id: true, orderNumber: true, caOrderId: true } } },
  });

  let resetOrders = 0;
  for (const cert of devCerts) {
    if (!cert.order.caOrderId) {
      console.log(`Order ${cert.order.orderNumber}: no caOrderId, skipping`);
      continue;
    }

    console.log(`Order ${cert.order.orderNumber}: self-signed cert found — deleting and resetting to PENDING_ISSUANCE`);

    // Delete the dev cert files
    for (const key of [cert.certFileKey, cert.chainFileKey]) {
      if (!key) continue;
      const filePath = path.join(process.cwd(), 'uploads', key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFiles++;
      }
    }

    // Delete the cert record
    await prisma.certificate.delete({ where: { id: cert.id } });

    // Reset order to PENDING_ISSUANCE so the CA poller picks it up
    await prisma.certificateOrder.update({
      where: { id: cert.order.id },
      data: {
        status: 'PENDING_ISSUANCE',
        caStatus: null,
        caAttempts: 0,
        caLastError: null,
        caRetryAfter: null,
      },
    });

    resetOrders++;
  }

  // ── Step 3: Summary ──
  console.log('\n=== Cleanup Complete ===');
  console.log(`Deleted cert records: ${deletedCerts}`);
  console.log(`Deleted files:        ${deletedFiles}`);
  console.log(`Orders reset:         ${resetOrders}`);
  console.log('\nThe CA poller will now re-fetch the real Certum certificates on its next 5-minute cycle.');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});