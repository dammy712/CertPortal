import { PrismaClient, UserRole, UserStatus, CertificateType, ValidityPeriod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

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
      wallet: { create: { balanceNgn: 0 } },
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
      wallet: { create: { balanceNgn: 50000 } },
    },
  });
  console.log(`✅ Customer created: ${customer.email}\n`);

  // ── Certificate Products ─────────────────────────────
  // Products from both CAs, mixed in the catalog

  const products = [
    // ─── Certum Products ───────────────────────────────
    {
      name: 'Certum DV SSL',
      slug: 'certum-dv-ssl',
      type: CertificateType.DV,
      brand: 'Certum',
      caProvider: 'certum',
      caProductCode: 'CERTUM_DV',
      description: 'Affordable domain-validated SSL from Certum. Issued within minutes. Ideal for blogs, personal sites, and small projects.',
      maxSans: 1,
      supportsWildcard: false,
      sortOrder: 10,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 12000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 22000 },
      ],
    },
    {
      name: 'Certum DV Multi-Domain SSL',
      slug: 'certum-dv-multidomain-ssl',
      type: CertificateType.DV_MULTIDOMAIN,
      brand: 'Certum',
      caProvider: 'certum',
      caProductCode: 'CERTUM_DV_MD',
      description: 'Secure multiple domains with a single Certum DV certificate. Up to 100 SANs.',
      maxSans: 100,
      supportsWildcard: false,
      sortOrder: 20,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 35000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 65000 },
      ],
    },
    {
      name: 'Certum DV Wildcard SSL',
      slug: 'certum-dv-wildcard-ssl',
      type: CertificateType.DV_WILDCARD,
      brand: 'Certum',
      caProvider: 'certum',
      caProductCode: 'CERTUM_DV_WC',
      description: 'Secure unlimited subdomains with a single Certum wildcard DV certificate.',
      maxSans: 1,
      supportsWildcard: true,
      sortOrder: 30,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 45000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 85000 },
      ],
    },
    {
      name: 'Certum OV SSL',
      slug: 'certum-ov-ssl',
      type: CertificateType.OV,
      brand: 'Certum',
      caProvider: 'certum',
      caProductCode: 'CERTUM_OV',
      description: 'Organization-validated SSL from Certum. Verifies your business identity for higher trust.',
      maxSans: 1,
      supportsWildcard: false,
      sortOrder: 40,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 30000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 55000 },
      ],
    },
    {
      name: 'Certum OV Wildcard SSL',
      slug: 'certum-ov-wildcard-ssl',
      type: CertificateType.OV_WILDCARD,
      brand: 'Certum',
      caProvider: 'certum',
      caProductCode: 'CERTUM_OV_WC',
      description: 'Wildcard certificate with full Certum organization validation. Covers all subdomains.',
      maxSans: 1,
      supportsWildcard: true,
      sortOrder: 50,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 80000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 150000 },
      ],
    },

    // ─── GlobalSign Products ───────────────────────────
    {
      name: 'GlobalSign DV SSL',
      slug: 'globalsign-dv-ssl',
      type: CertificateType.DV,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'DV_SHA256',
      description: 'Premium domain-validated SSL by GlobalSign. Industry-leading trust and browser compatibility.',
      maxSans: 1,
      supportsWildcard: false,
      sortOrder: 15,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 20000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 38000 },
      ],
    },
    {
      name: 'GlobalSign DV Multi-Domain SSL',
      slug: 'globalsign-dv-multidomain-ssl',
      type: CertificateType.DV_MULTIDOMAIN,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'DV_SHA256_MD',
      description: 'Secure multiple domains under one GlobalSign DV certificate. Enterprise-grade reliability.',
      maxSans: 100,
      supportsWildcard: false,
      sortOrder: 25,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 55000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 100000 },
      ],
    },
    {
      name: 'GlobalSign DV Wildcard SSL',
      slug: 'globalsign-dv-wildcard-ssl',
      type: CertificateType.DV_WILDCARD,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'DV_SHA256_WC',
      description: 'GlobalSign wildcard DV SSL — unlimited subdomains with premium trust.',
      maxSans: 1,
      supportsWildcard: true,
      sortOrder: 35,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 65000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 120000 },
      ],
    },
    {
      name: 'GlobalSign OV SSL',
      slug: 'globalsign-ov-ssl',
      type: CertificateType.OV,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'OV_SHA256',
      description: 'GlobalSign organization-validated SSL. Full business identity verification with green trust indicators.',
      maxSans: 1,
      supportsWildcard: false,
      sortOrder: 45,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 45000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 85000 },
      ],
    },
    {
      name: 'GlobalSign OV Multi-Domain SSL',
      slug: 'globalsign-ov-multidomain-ssl',
      type: CertificateType.OV_MULTIDOMAIN,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'OV_SHA256_MD',
      description: 'Secure multiple domains with GlobalSign OV — organization identity verified across all domains.',
      maxSans: 100,
      supportsWildcard: false,
      sortOrder: 55,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 85000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 160000 },
      ],
    },
    {
      name: 'GlobalSign OV Wildcard SSL',
      slug: 'globalsign-ov-wildcard-ssl',
      type: CertificateType.OV_WILDCARD,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'OV_SHA256_WC',
      description: 'GlobalSign wildcard OV SSL — full organization validation with unlimited subdomain coverage.',
      maxSans: 1,
      supportsWildcard: true,
      sortOrder: 60,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 110000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 200000 },
      ],
    },
    {
      name: 'GlobalSign EV SSL',
      slug: 'globalsign-ev-ssl',
      type: CertificateType.EV,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'EV_SHA256',
      description: 'Extended Validation SSL by GlobalSign. Highest trust level with rigorous identity verification.',
      maxSans: 1,
      supportsWildcard: false,
      sortOrder: 70,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 150000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 280000 },
      ],
    },
    {
      name: 'GlobalSign EV Multi-Domain SSL',
      slug: 'globalsign-ev-multidomain-ssl',
      type: CertificateType.EV_MULTIDOMAIN,
      brand: 'GlobalSign',
      caProvider: 'globalsign',
      caProductCode: 'EV_SHA256_MD',
      description: 'GlobalSign EV Multi-Domain — extended validation across multiple domains in one certificate.',
      maxSans: 100,
      supportsWildcard: false,
      sortOrder: 80,
      prices: [
        { validity: ValidityPeriod.ONE_YEAR, priceNgn: 250000 },
        { validity: ValidityPeriod.TWO_YEARS, priceNgn: 470000 },
      ],
    },
  ];

  for (const product of products) {
    const { prices, ...productData } = product;

    const created = await prisma.certificateProduct.upsert({
      where: { name: product.name },
      update: {
        slug: productData.slug,
        type: productData.type,
        brand: productData.brand,
        caProvider: productData.caProvider,
        caProductCode: productData.caProductCode,
        description: productData.description,
        maxSans: productData.maxSans,
        supportsWildcard: productData.supportsWildcard,
        sortOrder: productData.sortOrder,
      },
      create: {
        ...productData,
        prices: {
          create: prices,
        },
      },
    });
    console.log(`✅ Product: ${created.name} (${created.brand})`);
  }

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────────');
  console.log('Admin login:    admin@certportal.com / Admin@123456');
  console.log('Customer login: customer@example.com / Customer@123456');
  console.log(`Products:       ${products.length} certificates (Certum + GlobalSign)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
