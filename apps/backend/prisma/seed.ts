import { PrismaClient, UserRole, UserStatus, CertificateType, ValidityPeriod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Super Admin ──────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@certportal.com' },
    update: {},
    create: {
      email: 'admin@certportal.com',
      passwordHash: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      wallet: {
        create: { balanceNgn: 0 },
      },
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ── Test Customer ────────────────────────────────────
  const customerPassword = await bcrypt.hash('Customer@123456', 12);
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      passwordHash: customerPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      wallet: {
        create: {
          balanceNgn: 50000,
        },
      },
    },
  });
  console.log(`✅ Customer created: ${customer.email}`);

  // ── Certificate Products ─────────────────────────────
  const products = [
    {
      name: 'Domain Validation (DV) SSL',
      type: CertificateType.DV,
      description: 'Basic SSL certificate with domain validation only. Issued within minutes.',
      maxSans: 1,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 15000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 28000 },
      ],
    },
    {
      name: 'DV Multi-Domain (SAN) SSL',
      type: CertificateType.DV_MULTIDOMAIN,
      description: 'Secure multiple domains with a single DV certificate.',
      maxSans: 100,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 45000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 85000 },
      ],
    },
    {
      name: 'DV Wildcard SSL',
      type: CertificateType.DV_WILDCARD,
      description: 'Secure unlimited subdomains with a single wildcard DV certificate.',
      maxSans: 1,
      supportsWildcard: true,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 55000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 100000 },
      ],
    },
    {
      name: 'Organization Validation (OV) SSL',
      type: CertificateType.OV,
      description: 'Business-grade SSL with organization identity verification.',
      maxSans: 1,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 35000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 65000 },
      ],
    },
    {
      name: 'OV Multi-Domain (SAN) SSL',
      type: CertificateType.OV_MULTIDOMAIN,
      description: 'Secure multiple domains with organization identity verification.',
      maxSans: 100,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 75000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 140000 },
      ],
    },
    {
      name: 'OV Wildcard SSL',
      type: CertificateType.OV_WILDCARD,
      description: 'Wildcard certificate with full organization validation.',
      maxSans: 1,
      supportsWildcard: true,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 95000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 180000 },
      ],
    },
    {
      name: 'Extended Validation (EV) SSL',
      type: CertificateType.EV,
      description: 'Highest trust SSL with extended identity verification. Green bar in browsers.',
      maxSans: 1,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 120000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 220000 },
      ],
    },
    {
      name: 'EV Multi-Domain (SAN) SSL',
      type: CertificateType.EV_MULTIDOMAIN,
      description: 'Extended Validation for multiple domains in one certificate.',
      maxSans: 100,
      supportsWildcard: false,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 200000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 380000 },
      ],
    },
  ];

  for (const product of products) {
    const { prices, ...productData } = product;
    const created = await prisma.certificateProduct.upsert({
      where: { id: product.name }, // will not match, so always creates
      update: {},
      create: {
        ...productData,
        prices: {
          create: prices,
        },
      },
    });
    console.log(`✅ Product created: ${created.name}`);
  }

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────');
  console.log('Admin login:    admin@certportal.com / Admin@123456');
  console.log('Customer login: customer@example.com / Customer@123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
