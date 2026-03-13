import fs   from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

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
