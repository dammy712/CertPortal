/**
 * Certum Partner API Provider
 *
 * SOAP-based API integration with Certum CA.
 * Docs: https://repository.certum.pl/API/API%20-%20User%20Guide%20EN%205.17.pdf
 *
 * WSDL (also the service endpoint — POST directly to it):
 *   Test:       https://gs.test.certum.pl/service/PartnerApi.wsdl
 *   Production: https://gs.certum.pl/service/PartnerApi.wsdl
 *
 * Key facts derived from the live WSDL schema:
 *   - Namespace:  http://webservice.api.muc.unizeto.pl/  (NOT cps.certum.pl)
 *   - Auth:       inside body as <requestHeader><authToken>, password BEFORE userName
 *   - Style:      document-literal — operation element IS the body, no double-wrapping
 *   - Statuses:   AWAITING | VERIFICATION | ACCEPTED | ENROLLED | REJECTED
 *   - Revoke:     requires serialNumber (HEX), NOT orderID
 */

import { logger } from '../../utils/logger';
import type {
  CAProvider, CAOrderRequest, CAOrderResponse, CAOrderStatus,
  CACertificateDownload, CAValidationStatus,
} from './index';

// ─── Config ──────────────────────────────────────────────

// The WSDL URL IS the service endpoint — do NOT strip .wsdl
const CERTUM_ENDPOINT = process.env.CERTUM_API_URL || 'https://gs.test.certum.pl/service/PartnerApi.wsdl';
const CERTUM_USERNAME = process.env.CERTUM_API_KEY || '';
const CERTUM_PASSWORD = process.env.CERTUM_API_SECRET || '';

// ─── SOAP Helpers ────────────────────────────────────────

/**
 * Auth block per WSDL schema (tns:authToken type):
 * <password> must come BEFORE <userName> per schema element order.
 */
const authBlock = (): string => `
    <requestHeader>
      <authToken>
        <password>${CERTUM_PASSWORD}</password>
        <userName>${CERTUM_USERNAME}</userName>
      </authToken>
    </requestHeader>`;

/**
 * Build a SOAP envelope using the correct WSDL namespace.
 * Document-literal: the operation element wraps auth + content directly.
 */
const buildEnvelope = (operationName: string, innerContent: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
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

/**
 * Send a SOAP request to Certum and return the raw XML response.
 */
const soapRequest = async (operationName: string, innerContent: string): Promise<string> => {
  logger.debug(`Certum SOAP: ${operationName}`);

  const response = await fetch(CERTUM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"http://webservice.api.muc.unizeto.pl/${operationName}"`,
    },
    body: buildEnvelope(operationName, innerContent),
  });

  const text = await response.text();

  // 500 = SOAP fault — still parseable
  if (!response.ok && response.status !== 500) {
    logger.error(`Certum HTTP ${response.status}: ${text.substring(0, 300)}`);
    throw new Error(`Certum API HTTP error: ${response.status}`);
  }

  return text;
};

// ─── XML Helpers ─────────────────────────────────────────

const extractXmlValue = (xml: string, tag: string): string | null => {
  const match = xml.match(new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'i'));
  return match ? match[1].trim() : null;
};

const extractXmlValues = (xml: string, tag: string): string[] => {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'gi');
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
};

// ─── Product Code Map ─────────────────────────────────────

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

// DCV methods per docs section 4.2.3
const CERTUM_DCV_MAP: Record<string, string> = {
  'ADMIN':     'ADMIN',
  'EMAIL':     'ADMIN',
  'DNS_TXT':   'DNS_TXT',
  'DNS_CNAME': 'DNS_CNAME',
  'HTTP_FILE': 'FILE',
  'FILE':      'FILE',
};

// ─── Status Normalisation ─────────────────────────────────

const normalizeStatus = (s: string): string => {
  switch ((s || '').toUpperCase()) {
    case 'ENROLLED':     return 'issued';
    case 'REJECTED':     return 'cancelled';
    case 'AWAITING':     return 'pending';
    case 'VERIFICATION':
    case 'ACCEPTED':     return 'processing';
    default:             return 'pending';
  }
};

// ─── Provider ────────────────────────────────────────────

export class CertumProvider implements CAProvider {
  name = 'certum';

  async submitOrder(request: CAOrderRequest): Promise<CAOrderResponse> {
    const productCodes = CERTUM_PRODUCT_MAP[request.productCode];
    if (!productCodes) throw new Error(`Unknown Certum product code: ${request.productCode}`);

    // customer cannot equal partner login (docs 4.2.1)
    const customer = (request.customer || request.contact?.email || 'portal-customer')
      .replace(/\s+/g, '-').substring(0, 64);
    const safeCustomer = customer === CERTUM_USERNAME ? `${customer}-order` : customer;

    // SANEntries must include commonName (docs 4.2.2)
    const allSans = [...new Set([request.commonName, ...(request.sans || [])])];
    const sanEntries = allSans
      .map(san => `<SANEntry><DNSName>${san}</DNSName></SANEntry>`)
      .join('');

    const dcvMethod = CERTUM_DCV_MAP[request.validationMethod || 'ADMIN'] || 'ADMIN';

    const orgFields = request.organization ? `
        <organization>${request.organization.name}</organization>
        <locality>${request.organization.city || ''}</locality>
        <state>${request.organization.state || ''}</state>
        <country>${request.organization.country || 'NG'}</country>` : '';

    const requestorInfo = request.contact ? `
      <requestorInfo>
        <email>${request.contact.email}</email>
        <firstName>${(request.contact.firstName || '').substring(0, 16)}</firstName>
        <lastName>${(request.contact.lastName || '').substring(0, 40)}</lastName>
        ${request.contact.phone ? `<phone>${request.contact.phone}</phone>` : ''}
      </requestorInfo>` : '';

    const orgInfo = request.organization?.registrationNo ? `
      <organizationInfo>
        <taxIdentificationNumber>${request.organization.registrationNo}</taxIdentificationNumber>
      </organizationInfo>` : '';

    const xml = await soapRequest('quickOrder', `
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
        ${dcvMethod === 'ADMIN'
          ? '<approverEmailPrefix>ADMIN</approverEmailPrefix>'
          : request.validationEmail
            ? `<approverEmail>${request.validationEmail}</approverEmail>`
            : ''}
      </SANApprover>
      ${requestorInfo}
      ${orgInfo}`);

    const successCode = extractXmlValue(xml, 'successCode');
    const errorCode   = extractXmlValue(xml, 'errorCode');
    const caOrderId   = extractXmlValue(xml, 'orderID');

    if (successCode !== '0' || (errorCode && errorCode !== '0')) {
      const errMsg = `Certum quickOrder failed: successCode=${successCode}, errorCode=${errorCode}`;
      logger.error(`${errMsg}\nResponse: ${xml.substring(0, 800)}`);
      throw new Error(errMsg);
    }

    if (!caOrderId) throw new Error('Certum API did not return an order ID');

    logger.info(`Certum order placed: ${caOrderId}`);
    return { caOrderId, status: 'pending' };
  }

  async getOrderStatus(caOrderId: string): Promise<CAOrderStatus> {
    const stateXml = await soapRequest('getOrderState', `<orderID>${caOrderId}</orderID>`);

    const orderStatus = extractXmlValue(stateXml, 'orderStatus') || 'AWAITING';
    if (extractXmlValue(stateXml, 'successCode') !== '0') {
      throw new Error(`Certum getOrderState failed for ${caOrderId}`);
    }

    const result: CAOrderStatus = {
      caOrderId,
      status: normalizeStatus(orderStatus),
      caRawStatus: orderStatus,
    };

    if (orderStatus === 'ENROLLED') {
      const detailXml = await soapRequest('getOrderByOrderID', `
        <orderID>${caOrderId}</orderID>
        <orderOption>
          <orderStatus>true</orderStatus>
          <certificateDetails>true</certificateDetails>
        </orderOption>`);

      result.serialNumber   = extractXmlValue(detailXml, 'serialNumber') || undefined;
      result.certificatePem = extractXmlValue(detailXml, 'X509Cert') || undefined;

      const startDate = extractXmlValue(detailXml, 'startDate');
      const endDate   = extractXmlValue(detailXml, 'endDate');
      if (startDate) result.issuedAt  = new Date(startDate);
      if (endDate)   result.expiresAt = new Date(endDate);
    }

    return result;
  }

  async downloadCertificate(caOrderId: string): Promise<CACertificateDownload> {
    const xml = await soapRequest('getCertificate', `<orderID>${caOrderId}</orderID>`);

    if (extractXmlValue(xml, 'successCode') !== '0') {
      throw new Error('Certificate not yet available from Certum');
    }

    const certPem   = extractXmlValue(xml, 'X509Cert');
    const startDate = extractXmlValue(xml, 'startDate');
    const endDate   = extractXmlValue(xml, 'endDate');

    const caBundleMatch = xml.match(/<caBundle>([\s\S]*?)<\/caBundle>/i);
    const chainPem = caBundleMatch
      ? extractXmlValues(caBundleMatch[1], 'X509Cert').join('\n')
      : '';

    if (!certPem) throw new Error('Certificate not yet available from Certum');

    return {
      certificatePem: certPem,
      chainPem,
      serialNumber: extractXmlValue(xml, 'serialNumber') || '',
      issuedAt:  startDate ? new Date(startDate) : new Date(),
      expiresAt: endDate   ? new Date(endDate)   : new Date(Date.now() + 199 * 24 * 60 * 60 * 1000),
    };
  }

  async getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]> {
    const xml = await soapRequest('getSanVerificationState', `<orderID>${caOrderId}</orderID>`);
    const domains = extractXmlValues(xml, 'FQDN');
    const states  = extractXmlValues(xml, 'state');

    return domains.map((domain, i) => {
      const state = (states[i] || 'REQUIRED').toUpperCase();
      return {
        domain,
        method: 'DNS_TXT',
        status: state === 'VERIFIED' ? 'validated' : state === 'FAILED' ? 'failed' : 'pending',
      };
    });
  }

  async triggerValidation(caOrderId: string, _domain: string, method: string): Promise<void> {
    const dcvMethod = CERTUM_DCV_MAP[method] || 'ADMIN';
    await soapRequest('addSanVerification', `
      <orderID>${caOrderId}</orderID>
      <SANApprover>
        <approverMethod>${dcvMethod}</approverMethod>
        ${dcvMethod === 'ADMIN' ? '<approverEmailPrefix>ADMIN</approverEmailPrefix>' : ''}
      </SANApprover>`);
    logger.info(`Certum validation re-triggered for order ${caOrderId}`);
  }

  async cancelOrder(caOrderId: string): Promise<void> {
    await soapRequest('cancelOrder', `
      <cancelParameters>
        <orderID>${caOrderId}</orderID>
        <note>Cancelled via CertPortal</note>
      </cancelParameters>`);
    logger.info(`Certum order cancelled: ${caOrderId}`);
  }

  async revokeCertificate(caOrderId: string, reason?: string): Promise<void> {
    // Requires serialNumber in HEX — fetch it first (docs 6.34)
    const statusXml = await soapRequest('getOrderByOrderID', `
      <orderID>${caOrderId}</orderID>
      <orderOption><orderStatus>true</orderStatus></orderOption>`);

    const serialNumber = extractXmlValue(statusXml, 'serialNumber');
    if (!serialNumber) throw new Error('Cannot revoke: no serial number found for this order');

    const validReasons = ['KEYCOMPROMISE', 'AFFILIATIONCHANGED', 'CESSATIONOFOPERATION', 'UNSPECIFIED', 'SUPERSEDED'];
    const certumReason = validReasons.includes((reason || '').toUpperCase())
      ? reason!.toUpperCase() : 'UNSPECIFIED';

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
      const xml   = await soapRequest('getProductList', '<hashAlgorithm>false</hashAlgorithm>');
      const codes = extractXmlValues(xml, 'code');
      return codes.map(code => ({ code, name: `Certum Product ${code}`, type: 'ssl' }));
    } catch (err) {
      logger.warn('Failed to list Certum products — returning static map:', err);
      return Object.entries(CERTUM_PRODUCT_MAP).map(([key, val]) => ({
        code: String(val.issue), name: key, type: 'ssl',
      }));
    }
  }
}
