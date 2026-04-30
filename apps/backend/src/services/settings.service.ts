import fs   from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

// ─── Types ────────────────────────────────────────────

export interface InvoiceSettings {
  companyName:    string;
  companyAddress: string;
  companyCity:    string;
  companyState:   string;
  companyCountry: string;
  companyPhone:   string;
  companyEmail:   string;
  companyWebsite: string;
  companyLogo:    string;
  invoicePrefix:  string;
  currency:       string;
  currencySymbol: string;
  taxLabel:       string;
  taxRate:        number;
  paymentTerms:   string;
  dueDays:        number;
  footerNote:     string;
  bankName:       string;
  bankAccount:    string;
  bankSort:       string;
  accentColor:    string;
}

export interface PricingSettings {
  usdToNgn: number;         // Exchange rate: 1 USD = X NGN
  eurToNgn: number;         // Exchange rate: 1 EUR = X NGN
  plnToNgn: number;         // Exchange rate: 1 PLN = X NGN (for Certum which prices in PLN)
  markupPercent: number;    // Markup on top of CA cost (e.g. 20 = 20%)
  lastUpdated: string;      // ISO timestamp of last rate update
  updatedBy: string;        // Admin who last updated
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  companyName:    'CertPortal Ltd.',
  companyAddress: '1 SSL House, Victoria Island',
  companyCity:    'Lagos',
  companyState:   'Lagos State',
  companyCountry: 'Nigeria',
  companyPhone:   '+234 800 000 0000',
  companyEmail:   'billing@certportal.com',
  companyWebsite: 'https://certportal.com',
  companyLogo:    '',
  invoicePrefix:  'INV-',
  currency:       'NGN',
  currencySymbol: '₦',
  taxLabel:       'VAT',
  taxRate:        0,
  paymentTerms:   'Due on receipt',
  dueDays:        0,
  footerNote:     'Thank you for your business. For support: support@certportal.com',
  bankName:       '',
  bankAccount:    '',
  bankSort:       '',
  accentColor:    '#0ea5e9',
};

// Store settings in a JSON file — no DB dependency
const SETTINGS_PATH = path.join('/app', 'invoice-settings.json');

export const getInvoiceSettings = async (): Promise<InvoiceSettings> => {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
      return { ...DEFAULT_INVOICE_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    logger.warn('Could not read invoice settings file — using defaults.');
  }
  return DEFAULT_INVOICE_SETTINGS;
};

export const saveInvoiceSettings = async (
  _adminId: string,
  settings: Partial<InvoiceSettings>
): Promise<InvoiceSettings> => {
  const current = await getInvoiceSettings();
  const merged  = { ...current, ...settings };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  logger.info('Invoice settings updated.');
  return merged;
};

// ─── Pricing / Exchange Rate Settings ─────────────────
// Stored in the DB as a SystemSetting record (key-value).
// Uses the existing Prisma schema's auditLog for traceability.

const PRICING_KEY = 'pricing_settings';

export const DEFAULT_PRICING: PricingSettings = {
  usdToNgn:      1600,   // Approximate NGN/USD rate — admin should update this
  eurToNgn:      1750,   // Approximate NGN/EUR rate
  plnToNgn:      400,    // Approximate NGN/PLN rate (Certum prices in PLN)
  markupPercent: 25,     // 25% margin on top of CA cost
  lastUpdated:   new Date().toISOString(),
  updatedBy:     'system',
};

export const getPricingSettings = async (): Promise<PricingSettings> => {
  try {
    const record = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_ACTION', resourceId: PRICING_KEY },
      orderBy: { createdAt: 'desc' },
    });
    if (record?.metadata) {
      return record.metadata as unknown as PricingSettings;
    }
  } catch (err) {
    logger.warn('Could not read pricing settings — using defaults');
  }
  return DEFAULT_PRICING;
};

export const savePricingSettings = async (
  adminId: string,
  settings: Partial<PricingSettings>
): Promise<PricingSettings> => {
  const current = await getPricingSettings();
  const merged: PricingSettings = {
    ...current,
    ...settings,
    lastUpdated: new Date().toISOString(),
    updatedBy: adminId,
  };

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'ADMIN_ACTION',
      resourceId: PRICING_KEY,
      metadata: merged as any,
    },
  });

  logger.info(`Pricing settings updated by admin ${adminId}: USD=${merged.usdToNgn}, EUR=${merged.eurToNgn}, PLN=${merged.plnToNgn}, markup=${merged.markupPercent}%`);
  return merged;
};

/**
 * Calculate NGN price from a CA cost in USD.
 * Used to suggest prices based on current exchange rate + markup.
 */
export const calcNgnFromUsd = async (usdCost: number): Promise<number> => {
  const pricing = await getPricingSettings();
  const base = usdCost * pricing.usdToNgn;
  const withMarkup = base * (1 + pricing.markupPercent / 100);
  // Round to nearest 500 NGN for clean pricing
  return Math.ceil(withMarkup / 500) * 500;
};

export const calcNgnFromPln = async (plnCost: number): Promise<number> => {
  const pricing = await getPricingSettings();
  const base = plnCost * pricing.plnToNgn;
  const withMarkup = base * (1 + pricing.markupPercent / 100);
  return Math.ceil(withMarkup / 500) * 500;
};