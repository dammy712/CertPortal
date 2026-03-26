/**
 * CA Provider Abstraction Layer
 *
 * Routes certificate operations to the correct CA (Certum or GlobalSign)
 * based on the product's caProvider field.
 *
 * Both Certum and GlobalSign use SOAP/XML APIs:
 *   - Certum: https://gs.certum.pl/service/PartnerApi.wsdl
 *   - GlobalSign: https://system.globalsign.com/kb/ws/v1/ (SSL API)
 */

import { logger } from '../../utils/logger';

// ─── Shared Types ───────────────────────────────────────

export interface CAOrderRequest {
  productCode: string;          // CA-specific product code
  commonName: string;
  csr: string;
  sans?: string[];
  validity: string;             // ONE_YEAR | TWO_YEARS | THREE_YEARS
  organization?: {
    name: string;
    unit?: string;
    country: string;
    state?: string;
    city?: string;
    address?: string;
    phone?: string;
    registrationNo?: string;
  };
  contact?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  validationMethod?: 'EMAIL' | 'DNS_TXT' | 'DNS_CNAME' | 'HTTP_FILE';
  validationEmail?: string;     // For EMAIL validation
  customer?: string;            // Certum: unique customer identifier
}

export interface CAOrderResponse {
  caOrderId: string;            // CA's order/reference ID
  status: string;               // CA-specific status string
  approverEmails?: string[];    // Available domain validation emails
  validationDetails?: {
    method: string;
    domain: string;
    token?: string;
    dnsRecord?: string;
    httpFilePath?: string;
    httpFileContent?: string;
    email?: string;
  }[];
}

export interface CAOrderStatus {
  caOrderId: string;
  status: string;               // Normalized: pending | processing | issued | cancelled | rejected
  caRawStatus: string;          // Original CA status string
  certificatePem?: string;      // Available when issued
  chainPem?: string;
  serialNumber?: string;
  issuedAt?: Date;
  expiresAt?: Date;
}

export interface CACertificateDownload {
  certificatePem: string;
  chainPem: string;
  serialNumber: string;
  thumbprint?: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface CAValidationStatus {
  domain: string;
  method: string;
  status: string;               // pending | validated | failed
  token?: string;
  dnsRecord?: string;
  httpFilePath?: string;
  httpFileContent?: string;
}

export interface CAProvider {
  name: string;

  /** Submit a new certificate order to the CA */
  submitOrder(request: CAOrderRequest): Promise<CAOrderResponse>;

  /** Check the status of an existing order */
  getOrderStatus(caOrderId: string): Promise<CAOrderStatus>;

  /** Retrieve the issued certificate files */
  downloadCertificate(caOrderId: string): Promise<CACertificateDownload>;

  /** Get domain validation status for an order */
  getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]>;

  /** Trigger/re-trigger domain validation */
  triggerValidation(caOrderId: string, domain: string, method: string): Promise<void>;

  /** Cancel a pending order */
  cancelOrder(caOrderId: string): Promise<void>;

  /** Revoke an issued certificate */
  revokeCertificate(caOrderId: string, reason?: string): Promise<void>;

  /** List available products from this CA (for admin sync) */
  listProducts(): Promise<Array<{ code: string; name: string; type: string }>>;
}

// ─── Provider Registry ──────────────────────────────────

import { CertumProvider } from './certum.provider';
import { GlobalSignProvider } from './globalsign.provider';
import { DevProvider } from './dev.provider';

const providers: Record<string, CAProvider> = {};

export const getProvider = (caProvider: string): CAProvider => {
  if (!providers[caProvider]) {
    switch (caProvider) {
      case 'certum':
        providers[caProvider] = new CertumProvider();
        break;
      case 'globalsign':
        providers[caProvider] = new GlobalSignProvider();
        break;
      case 'dev':
        providers[caProvider] = new DevProvider();
        break;
      default:
        logger.warn(`Unknown CA provider: ${caProvider}, falling back to dev provider`);
        providers[caProvider] = new DevProvider();
    }
  }
  return providers[caProvider];
};

/**
 * Resolve which provider to use for a given order.
 * Falls back to 'dev' if no caProvider is set (backwards compat).
 */
export const resolveProvider = (caProvider?: string | null): CAProvider => {
  return getProvider(caProvider || 'dev');
};
