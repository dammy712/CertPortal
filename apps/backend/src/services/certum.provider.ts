/**
 * Certum Partner API Provider
 *
 * SOAP-based API integration with Certum CA.
 * Docs: https://repository.certum.pl/API/API%20-%20User%20Guide%20EN%205.17.pdf
 * WSDL: https://gs.certum.pl/service/PartnerApi.wsdl (production)
 *       https://gs.test.certum.pl/service/PartnerApi.wsdl (test)
 *
 * Product codes (from Certum docs v5.17):
 *   Commercial SSL (DV):           601 (issue), 606 (renew)
 *   Commercial Wildcard SSL:       741 (issue), 746 (renew)
 *   Commercial MultiDomain SSL:    931 (issue), 936 (renew)
 *   Trusted SSL (OV):              631 (issue), 636 (renew)
 *   Trusted Wildcard SSL:          681 (issue), 686 (renew)
 *   Trusted MultiDomain SSL:       921 (issue), 926 (renew)
 *   Premium EV SSL:                641 (issue), 646 (renew)
 *   Premium EV MultiDomain SSL:    981 (issue), 986 (renew)
 */

import { logger } from '../../utils/logger';
import type {
  CAProvider, CAOrderRequest, CAOrderResponse, CAOrderStatus,
  CACertificateDownload, CAValidationStatus,
} from './index';

// ─── SOAP Helpers ───────────────────────────────────────

// The WSDL URL IS the service endpoint — Certum accepts POSTs directly to it
const CERTUM_ENDPOINT = process.env.CERTUM_API_URL || 'https://gs.test.certum.pl/service/PartnerApi.wsdl';
const CERTUM_USERNAME = process.env.CERTUM_API_KEY || '';
const CERTUM_PASSWORD = process.env.CERTUM_API_SECRET || '';
const CERTUM_PARTNER = process.env.CERTUM_PARTNER_ID || '';

/**
 * Build auth block per WSDL schema (tns:authToken):
 * password comes before userName in the schema definition.
 */
const authBlock = (): string => `
    <requestHeader>
      <authToken>
        <password>${CERTUM_PASSWORD}</password>
        <userName>${CERTUM_USERNAME}</userName>
      </authToken>
    </requestHeader>`;

/**
 * Build a full SOAP envelope for Certum document-style API.
 * The operation element IS the body content — no double-wrapping.
 * Per WSDL schema: <operationName><requestHeader>...</requestHeader>...content...</operationName>
 */
const buildSoapEnvelope = (operationName: string, innerContent: string): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://webservice.api.muc.unizeto.pl/">
  <soapenv:Body>
    <tns:${operationName}>
      ${authBlock()}
      ${innerContent}
    </tns:${operationName}>
  </soapenv:Body>
</soapenv:Envelope>`;
};

/**
 * Send a SOAP request to Certum and return the XML response text.
 */
const soapRequest = async (operationName: string, innerContent: string): Promise<string> => {
  const envelope = buildSoapEnvelope(operationName, innerContent);

  logger.debug(`Certum SOAP request: ${operationName}`);

  const response = await fetch(CERTUM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"http://webservice.api.muc.unizeto.pl/${operationName}"`,
    },
    body: envelope,
  });

  const responseText = await response.text();

  if (!response.ok && response.status !== 500) {
    logger.error(`Certum HTTP error ${response.status}: ${responseText.substring(0, 300)}`);
    throw new Error(`Certum API HTTP error: ${response.status}`);
  }

  return responseText;
};

/**
 * Simple XML value extractor (avoids heavy XML parser dependency).
 * Works for flat SOAP responses from Certum.
 */
const extractXmlValue = (xml: string, tag: string): string | null => {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
};

const extractXmlValues = (xml: string, tag: string): string[] => {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
};

// ─── Certum Product Code Mapping ────────────────────────

const CERTUM_PRODUCT_MAP: Record<string, { issue: number; renew: number }> = {
  'CERTUM_DV':    { issue: 601, renew: 606 },
  'CERTUM_DV_WC': { issue: 741, renew: 746 },
  'CERTUM_DV_MD': { issue: 931, renew: 936 },
  'CERTUM_OV':    { issue: 631, renew: 636 },
  'CERTUM_OV_WC': { issue: 681, renew: 686 },
  'CERTUM_OV_MD': { issue: 921, renew: 926 },
  'CERTUM_EV':    { issue: 641, renew: 646 },
  'CERTUM_EV_MD': { issue: 981, renew: 986 },
};

// Certum domain verification method mapping
const CERTUM_DCV_MAP: Record<string, string> = {
  'EMAIL':      'EMAIL',
  'DNS_TXT':    'DNS',
  'DNS_CNAME':  'DNS',
  'HTTP_FILE':  'HTTPS',
};

// ─── Certum status normalization ────────────────────────
// Certum order statuses per docs section 6.12: AWAITING, VERIFICATION, ACCEPTED, ENROLLED, REJECTED

const normalizeStatus = (certumStatus: string): string => {
  const s = certumStatus?.toUpperCase() || '';
  if (s === 'ENROLLED') return 'issued';
  if (s === 'REJECTED') return 'cancelled';
  if (s === 'AWAITING') return 'pending';
  if (['VERIFICATION', 'ACCEPTED'].includes(s)) return 'processing';
  return 'pending';
};

// ─── DCV method mapping ──────────────────────────────────
// Certum methods per docs section 4.2.3: ADMIN, FILE, DNS_TXT, DNS_CNAME, DNS_TXT_PREFIX, DNS_CNAME_PREFIX

const CERTUM_DCV_MAP: Record<string, string> = {
  'ADMIN':      'ADMIN',
  'EMAIL':      'ADMIN',    // Legacy — map to ADMIN
  'DNS_TXT':    'DNS_TXT',
  'DNS_CNAME':  'DNS_CNAME',
  'HTTP_FILE':  'FILE',
};

// ─── Provider Implementation ────────────────────────────

export class CertumProvider implements CAProvider {
  name = 'certum';

  async submitOrder(request: CAOrderRequest): Promise<CAOrderResponse> {
    const productCodes = CERTUM_PRODUCT_MAP[request.productCode];
    if (!productCodes) {
      throw new Error(`Unknown Certum product code: ${request.productCode}`);
    }

    const customer = request.customer || request.contact?.email || 'portal-customer';
    // customer cannot equal the partner login per docs section 4.2.1
    const safeCustomer = customer === CERTUM_USERNAME ? `${customer}-order` : customer;

    // Build SANEntries per docs section 6.4
    const sanEntries = (request.sans || [request.commonName])
      .map(san => `<SANEntry><DNSName>${san}</DNSName></SANEntry>`)
      .join('');

    const dcvMethod = CERTUM_DCV_MAP[request.validationMethod || 'ADMIN'] || 'ADMIN';

    // Build organization fields for OV/EV (docs section 4.2)
    const orgFields = request.organization ? `
        <organization>${request.organization.name}</organization>
        <locality>${request.organization.city || ''}</locality>
        <state>${request.organization.state || ''}</state>
        <country>${request.organization.country || 'NG'}</country>
        ${request.organization.registrationNo ? `<serialNumber>${request.organization.registrationNo}</serialNumber>` : ''}
    ` : '';

    // requestorInfo required for OV/EV (docs section 6.4)
    const requestorInfo = request.contact ? `
      <requestorInfo>
        <email>${request.contact.email}</email>
        <firstName>${request.contact.firstName || ''}</firstName>
        <lastName>${request.contact.lastName || ''}</lastName>
        ${request.contact.phone ? `<phone>${request.contact.phone}</phone>` : ''}
      </requestorInfo>` : '';

    // organizationInfo for OV/EV (docs section 6.4)
    const orgInfo = request.organization?.registrationNo ? `
      <organizationInfo>
        <taxIdentificationNumber>${request.organization.registrationNo}</taxIdentificationNumber>
      </organizationInfo>` : '';

    const innerBody = `
      <orderParameters>
        <customer>${safeCustomer}</customer>
        <productCode>${productCodes.issue}</productCode>
        <CSR>${request.csr}</CSR>
        <commonName>${request.commonName}</commonName>
        <email>${request.contact?.email || ''}</email>
        ${orgFields}
      </orderParameters>
      <SANEntries>${sanEntries}</SANEntries>
      <SANApprover>
        <approverMethod>${dcvMethod}</approverMethod>
        ${request.validationEmail && dcvMethod !== 'ADMIN' ? `<approverEmail>${request.validationEmail}</approverEmail>` : ''}
        ${dcvMethod === 'ADMIN' ? '<approverEmailPrefix>ADMIN</approverEmailPrefix>' : ''}
      </SANApprover>
      ${requestorInfo}
      ${orgInfo}`;

    const xml = await soapRequest('quickOrder', innerBody);

    const successCode = extractXmlValue(xml, 'successCode');
    const errorCode = extractXmlValue(xml, 'errorCode');
    const caOrderId = extractXmlValue(xml, 'orderID');

    if (successCode !== '0' || (errorCode && errorCode !== '0')) {
      const errDesc = errorCode ? `error code ${errorCode}` : 'unknown error';
      logger.error(`Certum quickOrder failed: ${errDesc}\nResponse: ${xml.substring(0, 600)}`);
      throw new Error(`Certum order failed: ${errDesc}`);
    }

    if (!caOrderId) {
      throw new Error('Certum API did not return an order ID');
    }

    logger.info(`Certum order placed: ${caOrderId}`);

    return {
      caOrderId,
      status: 'pending',
    };
  }

  async getOrderStatus(caOrderId: string): Promise<CAOrderStatus> {
    // Use getOrderState per docs section 6.12 — returns verification status
    const xml = await soapRequest('getOrderState', `<orderID>${caOrderId}</orderID>`);

    const orderStatus = extractXmlValue(xml, 'orderStatus') || 'AWAITING';
    const successCode = extractXmlValue(xml, 'successCode');

    if (successCode === '1' || successCode === '3') {
      throw new Error(`Certum getOrderState failed for ${caOrderId}`);
    }

    const result: CAOrderStatus = {
      caOrderId,
      status: normalizeStatus(orderStatus),
      caRawStatus: orderStatus,
    };

    // If ENROLLED, get full order details including certificate
    if (orderStatus === 'ENROLLED') {
      const detailXml = await soapRequest('getOrderByOrderID', `
        <orderID>${caOrderId}</orderID>
        <orderOption>
          <orderStatus>true</orderStatus>
          <certificateDetails>true</certificateDetails>
        </orderOption>`);

      result.serialNumber = extractXmlValue(detailXml, 'serialNumber') || undefined;
      result.certificatePem = extractXmlValue(detailXml, 'X509Cert') || undefined;

      const startDate = extractXmlValue(detailXml, 'startDate');
      const endDate = extractXmlValue(detailXml, 'endDate');
      if (startDate) result.issuedAt = new Date(startDate);
      if (endDate) result.expiresAt = new Date(endDate);
    }

    return result;
  }

  async downloadCertificate(caOrderId: string): Promise<CACertificateDownload> {
    // Use getCertificate per docs section 6.32
    const xml = await soapRequest('getCertificate', `<orderID>${caOrderId}</orderID>`);

    const successCode = extractXmlValue(xml, 'successCode');
    if (successCode !== '0') {
      throw new Error('Certificate not yet available from Certum');
    }

    // getCertificateResponse returns certificateDetails/X509Cert and caBundle/X509Cert
    const certPem = extractXmlValue(xml, 'X509Cert');
    const startDate = extractXmlValue(xml, 'startDate');
    const endDate = extractXmlValue(xml, 'endDate');

    // Extract CA bundle (intermediate + root certs)
    const chainMatch = xml.match(/<caBundle>([\s\S]*?)<\/caBundle>/i);
    const chainPem = chainMatch ? extractXmlValue(chainMatch[1], 'X509Cert') || '' : '';

    if (!certPem) {
      throw new Error('Certificate not yet available from Certum');
    }

    return {
      certificatePem: certPem,
      chainPem,
      serialNumber: extractXmlValue(xml, 'serialNumber') || '',
      issuedAt: startDate ? new Date(startDate) : new Date(),
      expiresAt: endDate ? new Date(endDate) : new Date(Date.now() + 199 * 24 * 60 * 60 * 1000),
    };
  }

  async getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]> {
    // Use getSanVerificationState per docs section 6.18
    const xml = await soapRequest('getSanVerificationState', `<orderID>${caOrderId}</orderID>`);

    const domains = extractXmlValues(xml, 'FQDN');
    const states = extractXmlValues(xml, 'state');

    return domains.map((domain, i) => {
      const state = (states[i] || 'REQUIRED').toUpperCase();
      return {
        domain,
        method: 'DNS_TXT',
        status: state === 'VERIFIED' ? 'validated' : state === 'FAILED' ? 'failed' : 'pending',
      };
    });
  }

  async triggerValidation(caOrderId: string, domain: string, method: string): Promise<void> {
    // Use performSanVerification per docs section 6.22 — takes a verification code
    // For resend, use addSanVerification to generate a new code
    const dcvMethod = CERTUM_DCV_MAP[method] || 'ADMIN';
    await soapRequest('addSanVerification', `
      <orderID>${caOrderId}</orderID>
      <SANApprover>
        <approverMethod>${dcvMethod}</approverMethod>
        ${dcvMethod === 'ADMIN' ? '<approverEmailPrefix>ADMIN</approverEmailPrefix>' : ''}
      </SANApprover>`);
    logger.info(`Certum validation triggered for ${domain} on order ${caOrderId}`);
  }

  async cancelOrder(caOrderId: string): Promise<void> {
    // Use cancelOrder per docs section 6.16
    await soapRequest('cancelOrder', `
      <cancelParameters>
        <orderID>${caOrderId}</orderID>
        <note>Cancelled via CertPortal</note>
      </cancelParameters>`);
    logger.info(`Certum order cancelled: ${caOrderId}`);
  }

  async revokeCertificate(caOrderId: string, reason?: string): Promise<void> {
    // revokeCertificate requires serialNumber, not orderID — get it first
    const statusXml = await soapRequest('getOrderByOrderID', `
      <orderID>${caOrderId}</orderID>
      <orderOption><orderStatus>true</orderStatus></orderOption>`);

    const serialNumber = extractXmlValue(statusXml, 'serialNumber');
    if (!serialNumber) {
      throw new Error('Cannot revoke: no serial number found for this order');
    }

    // Map reason to Certum values per docs section 6.34
    const validReasons = ['KEYCOMPROMISE', 'AFFILIATIONCHANGED', 'CESSATIONOFOPERATION', 'UNSPECIFIED', 'SUPERSEDED'];
    const certumReason = validReasons.includes((reason || '').toUpperCase())
      ? reason!.toUpperCase()
      : 'UNSPECIFIED';

    await soapRequest('revokeCertificate', `
      <revokeCertificateParameters>
        <serialNumber>${serialNumber}</serialNumber>
        <revocationReason>${certumReason}</revocationReason>
        <note>Revoked via CertPortal</note>
      </revokeCertificateParameters>`);

    logger.info(`Certum certificate revoked: serial ${serialNumber}`);
  }

  async listProducts(): Promise<Array<{ code: string; name: string; type: string }>> {
    try {
      const xml = await soapRequest('getProductList', '<hashAlgorithm>false</hashAlgorithm>');
      const codes = extractXmlValues(xml, 'code');
      const validityPeriods = extractXmlValues(xml, 'validityPeriod');

      return codes.map((code, i) => ({
        code,
        name: `Certum Product ${code}`,
        type: 'ssl',
      }));
    } catch (err) {
      logger.warn('Failed to list Certum products:', err);
      return Object.entries(CERTUM_PRODUCT_MAP).map(([key, val]) => ({
        code: String(val.issue),
        name: key,
        type: 'ssl',
      }));
    }
  }
}