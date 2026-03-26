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

const CERTUM_WSDL = process.env.CERTUM_API_URL || 'https://gs.certum.pl/service/PartnerApi.wsdl';
const CERTUM_USERNAME = process.env.CERTUM_API_KEY || '';
const CERTUM_PASSWORD = process.env.CERTUM_API_SECRET || '';
const CERTUM_PARTNER = process.env.CERTUM_PARTNER_ID || '';

/**
 * Build a SOAP XML envelope for Certum Partner API.
 * Certum uses WS-Security headers for auth.
 */
const buildSoapEnvelope = (body: string): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://service.api.cps.certum.pl/">
  <soapenv:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${CERTUM_USERNAME}</wsse:Username>
        <wsse:Password>${CERTUM_PASSWORD}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
};

/**
 * Send a SOAP request to Certum and parse the XML response.
 */
const soapRequest = async (endpoint: string, body: string): Promise<string> => {
  const envelope = buildSoapEnvelope(body);

  logger.debug(`Certum SOAP request to ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '',
    },
    body: envelope,
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(`Certum SOAP error ${response.status}: ${responseText.substring(0, 500)}`);
    throw new Error(`Certum API error: ${response.status}`);
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

// ─── Normalize Certum status → our internal status ──────

const normalizeStatus = (certumStatus: string): string => {
  const s = certumStatus?.toUpperCase() || '';
  if (['ISSUED', 'ACTIVE'].includes(s)) return 'issued';
  if (['CANCELLED', 'REJECTED', 'REVOKED'].includes(s)) return 'cancelled';
  if (['NEW', 'PENDING', 'WAITING_FOR_VERIFICATION'].includes(s)) return 'pending';
  if (['VERIFYING', 'PROCESSING', 'VERIFIED'].includes(s)) return 'processing';
  return 'pending';
};

// ─── Provider Implementation ────────────────────────────

export class CertumProvider implements CAProvider {
  name = 'certum';

  private getEndpoint(): string {
    // Strip .wsdl to get the service endpoint
    return CERTUM_WSDL.replace(/\.wsdl$/, '');
  }

  async submitOrder(request: CAOrderRequest): Promise<CAOrderResponse> {
    const productCodes = CERTUM_PRODUCT_MAP[request.productCode];
    if (!productCodes) {
      throw new Error(`Unknown Certum product code: ${request.productCode}`);
    }

    // Build SAN entries for multi-domain certs
    const sanEntries = (request.sans || [])
      .map((san, i) => `
        <SANEntry>
          <DNSName>${san}</DNSName>
        </SANEntry>`)
      .join('');

    // Build organization fields for OV/EV
    const orgFields = request.organization ? `
      <O>${request.organization.name}</O>
      <L>${request.organization.city || ''}</L>
      <SP>${request.organization.state || ''}</SP>
      <C>${request.organization.country || 'NG'}</C>
      ${request.organization.registrationNo ? `<SN>${request.organization.registrationNo}</SN>` : ''}
    ` : '';

    const dcvMethod = CERTUM_DCV_MAP[request.validationMethod || 'EMAIL'] || 'EMAIL';

    const body = `
    <ser:quickOrder>
      <quickOrderRequest>
        <productCode>${productCodes.issue}</productCode>
        <customer>${request.customer || request.contact?.email || 'portal-customer'}</customer>
        <CSR>${request.csr}</CSR>
        <CN>${request.commonName}</CN>
        ${orgFields}
        <E>${request.contact?.email || ''}</E>
        ${request.contact ? `
          <GN>${request.contact.firstName || ''}</GN>
          <surname>${request.contact.lastName || ''}</surname>
        ` : ''}
        <verificationMethod>${dcvMethod}</verificationMethod>
        ${request.validationEmail ? `<approverEmail>${request.validationEmail}</approverEmail>` : ''}
        ${sanEntries ? `<SANEntries>${sanEntries}</SANEntries>` : ''}
      </quickOrderRequest>
    </ser:quickOrder>`;

    const xml = await soapRequest(this.getEndpoint(), body);

    const caOrderId = extractXmlValue(xml, 'orderID') || extractXmlValue(xml, 'orderId');
    const status = extractXmlValue(xml, 'orderStatus') || 'NEW';
    const errorCode = extractXmlValue(xml, 'errorCode');

    if (errorCode && errorCode !== '0') {
      const errorMessage = extractXmlValue(xml, 'errorMessage') || 'Unknown Certum error';
      logger.error(`Certum order failed: ${errorCode} - ${errorMessage}`);
      throw new Error(`Certum order error: ${errorMessage} (code: ${errorCode})`);
    }

    if (!caOrderId) {
      logger.error('Certum order response missing orderID');
      throw new Error('Certum API did not return an order ID');
    }

    logger.info(`Certum order placed: ${caOrderId} (status: ${status})`);

    return {
      caOrderId,
      status: normalizeStatus(status),
    };
  }

  async getOrderStatus(caOrderId: string): Promise<CAOrderStatus> {
    const body = `
    <ser:getOrderByOrderID>
      <getOrderByOrderIDRequest>
        <orderID>${caOrderId}</orderID>
      </getOrderByOrderIDRequest>
    </ser:getOrderByOrderID>`;

    const xml = await soapRequest(this.getEndpoint(), body);

    const status = extractXmlValue(xml, 'orderStatus') || 'UNKNOWN';
    const serialNumber = extractXmlValue(xml, 'serialNumber');

    const result: CAOrderStatus = {
      caOrderId,
      status: normalizeStatus(status),
      caRawStatus: status,
    };

    // If issued, try to get certificate data inline
    if (normalizeStatus(status) === 'issued' && serialNumber) {
      result.serialNumber = serialNumber;
      result.certificatePem = extractXmlValue(xml, 'X509Cert') || undefined;
    }

    return result;
  }

  async downloadCertificate(caOrderId: string): Promise<CACertificateDownload> {
    const body = `
    <ser:getCertificate>
      <getCertificateRequest>
        <orderID>${caOrderId}</orderID>
      </getCertificateRequest>
    </ser:getCertificate>`;

    const xml = await soapRequest(this.getEndpoint(), body);

    const certPem = extractXmlValue(xml, 'X509Cert');
    const chainPem = extractXmlValue(xml, 'X509CACert') || extractXmlValue(xml, 'chainCert');
    const serialNumber = extractXmlValue(xml, 'serialNumber');
    const notBefore = extractXmlValue(xml, 'notBefore');
    const notAfter = extractXmlValue(xml, 'notAfter');

    if (!certPem) {
      throw new Error('Certificate not yet available from Certum');
    }

    return {
      certificatePem: certPem,
      chainPem: chainPem || '',
      serialNumber: serialNumber || '',
      issuedAt: notBefore ? new Date(notBefore) : new Date(),
      expiresAt: notAfter ? new Date(notAfter) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  async getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]> {
    const body = `
    <ser:getSanVerificationState>
      <getSanVerificationStateRequest>
        <orderID>${caOrderId}</orderID>
      </getSanVerificationStateRequest>
    </ser:getSanVerificationState>`;

    const xml = await soapRequest(this.getEndpoint(), body);

    // Extract domain verification entries
    const domains = extractXmlValues(xml, 'DNSName');
    const statuses = extractXmlValues(xml, 'verificationStatus');
    const methods = extractXmlValues(xml, 'verificationMethod');

    return domains.map((domain, i) => ({
      domain,
      method: methods[i] || 'EMAIL',
      status: (statuses[i] || 'PENDING').toLowerCase().includes('verified') ? 'validated' : 'pending',
    }));
  }

  async triggerValidation(caOrderId: string, domain: string, method: string): Promise<void> {
    const dcvMethod = CERTUM_DCV_MAP[method] || 'EMAIL';

    const body = `
    <ser:performSanVerification>
      <performSanVerificationRequest>
        <orderID>${caOrderId}</orderID>
        <DNSName>${domain}</DNSName>
        <verificationMethod>${dcvMethod}</verificationMethod>
      </performSanVerificationRequest>
    </ser:performSanVerification>`;

    await soapRequest(this.getEndpoint(), body);
    logger.info(`Certum validation triggered for ${domain} on order ${caOrderId}`);
  }

  async cancelOrder(caOrderId: string): Promise<void> {
    const body = `
    <ser:cancelOrder>
      <cancelOrderRequest>
        <orderID>${caOrderId}</orderID>
      </cancelOrderRequest>
    </ser:cancelOrder>`;

    await soapRequest(this.getEndpoint(), body);
    logger.info(`Certum order cancelled: ${caOrderId}`);
  }

  async revokeCertificate(caOrderId: string, reason?: string): Promise<void> {
    const body = `
    <ser:revokeCertificate>
      <revokeCertificateRequest>
        <orderID>${caOrderId}</orderID>
        <revocationReason>${reason || 'unspecified'}</revocationReason>
      </revokeCertificateRequest>
    </ser:revokeCertificate>`;

    await soapRequest(this.getEndpoint(), body);
    logger.info(`Certum certificate revoked for order: ${caOrderId}`);
  }

  async listProducts(): Promise<Array<{ code: string; name: string; type: string }>> {
    const body = `
    <ser:getProductList>
      <getProductListRequest/>
    </ser:getProductList>`;

    try {
      const xml = await soapRequest(this.getEndpoint(), body);
      const codes = extractXmlValues(xml, 'productCode');
      const names = extractXmlValues(xml, 'productName');

      return codes.map((code, i) => ({
        code,
        name: names[i] || code,
        type: 'ssl',
      }));
    } catch (err) {
      logger.warn('Failed to list Certum products:', err);
      // Return static list as fallback
      return Object.entries(CERTUM_PRODUCT_MAP).map(([key, val]) => ({
        code: String(val.issue),
        name: key,
        type: 'ssl',
      }));
    }
  }
}
