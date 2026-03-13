// One-time script to create order_status_history table safely
import { prisma } from './prisma';

async function run() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "order_status_history" (
      "id" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "fromStatus" TEXT,
      "toStatus" TEXT NOT NULL,
      "reason" TEXT,
      "note" TEXT,
      "changedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "order_status_history_orderId_fkey" 
        FOREIGN KEY ("orderId") REFERENCES "certificate_orders"("id") 
        ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "order_status_history_orderId_idx" 
    ON "order_status_history"("orderId");
  `);
  console.log('✅ order_status_history table created successfully');
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
