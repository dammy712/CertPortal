/**
 * GlobalSign SSL API Provider
 *
 * XML/SOAP-based API integration with GlobalSign.
 * Docs: https://www.globalsign.com/en/repository/globalsign-ssl-api-documentation.pdf
 * Endpoints:
 *   Production: https://system.globalsign.com/kb/ws/v1/
 *   Test:       https://testsystem.globalsign.com/kb/ws/v1/
 *
 * GlobalSign SSL API product codes:
 *   DV_LOW           → AlphaSSL (budget DV)
 *   DV               → DomainSSL
 *   DV_SHA2          → DomainSSL SHA-256
 *   OV               → OrganizationSSL
 *   OV_SHA2          → OrganizationSSL SHA-256
 *   EV               → ExtendedSSL
 *   EV_SHA2          → ExtendedSSL SHA-256
 *
 * Flow:
 *   1. OrderRequestorInfo (auth) → get token
 *   2. URLVerification / DVOrder / OVOrder / EVOrder
 *   3. GetOrderByOrderID (poll status)
 *   4. Certificate returned in order response when issued
 */

import { logger } from '../../utils/logger';
import type {
  CAProvider, CAOrderRequest, CAOrderResponse, CAOrderStatus,
  CACertificateDownload, CAValidationStatus,
} from './index';

// ─── Config ─────────────────────────────────────────────

const GS_API_BASE = process.env.GLOBALSIGN_API_URL || 'https://system.globalsign.com';
const GS_API_KEY = process.env.GLOBALSIGN_API_KEY || '';
const GS_API_SECRET = process.env.GLOBALSIGN_API_SECRET || '';
const GS_MSSL_DOMAIN = process.env.GLOBALSIGN_MSSL_DOMAIN || '';

// ─── XML Helpers ────────────────────────────────────────

const extractXmlValue = (xml: string, tag: string): string | null => {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
};

const extractXmlBlock = (xml: string, tag: string): string | null => {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
};

/**
 * Build the GlobalSign auth header block used in every request.
 */
const authBlock = (): string => `
  <AuthToken>
    <UserName>${GS_API_KEY}</UserName>
    <Password>${GS_API_SECRET}</Password>
  </AuthToken>`;

/**
 * Send an XML request to GlobalSign SSL API.
 * GlobalSign uses plain XML POST (not full SOAP envelope).
 */
const gsRequest = async (path: string, xmlBody: string): Promise<string> => {
  const url = `${GS_API_BASE}/kb/ws/v1/${path}`;

  logger.debug(`GlobalSign request: POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
    body: xmlBody,
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(`GlobalSign API error ${response.status}: ${responseText.substring(0, 500)}`);
    throw new Error(`GlobalSign API error: ${response.status}`);
  }

  // Check for error in response body
  const errorCode = extractXmlValue(responseText, 'ErrorCode');
  const errorMessage = extractXmlValue(responseText, 'ErrorMessage');

  if (errorCode && errorCode !== '0' && errorCode !== '-1') {
    logger.error(`GlobalSign error: ${errorCode} - ${errorMessage}`);
    throw new Error(`GlobalSign error: ${errorMessage} (code: ${errorCode})`);
  }

  return responseText;
};

// ─── Product type detection ─────────────────────────────

const getOrderType = (productCode: string): 'DV' | 'OV' | 'EV' => {
  const code = productCode.toUpperCase();
  if (code.startsWith('EV')) return 'EV';
  if (code.startsWith('OV')) return 'OV';
  return 'DV';
};

// Normalize GlobalSign status → our internal status
const normalizeStatus = (gsStatus: string): string => {
  const s = (gsStatus || '').toUpperCase();
  if (['ISSUED', 'COMPLETED', '2', '3'].includes(s)) return 'issued';
  if (['CANCELLED', 'REVOKED', 'REJECTED', '-1'].includes(s)) return 'cancelled';
  if (['WAITING_FOR_PHISHING_CHECK', 'WAITING_FOR_APPROVAL', '1'].includes(s)) return 'processing';
  if (['INITIAL', 'PENDING', '0'].includes(s)) return 'pending';
  return 'pending';
};

// ─── Validity period → GlobalSign months ────────────────

const validityToMonths = (validity: string): number => {
  switch (validity) {
    case 'THREE_YEARS': return 36;
    case 'TWO_YEARS': return 24;
    default: return 12;
  }
};

// ─── Provider Implementation ────────────────────────────

export class GlobalSignProvider implements CAProvider {
  name = 'globalsign';

  async submitOrder(request: CAOrderRequest): Promise<CAOrderResponse> {
    const orderType = getOrderType(request.productCode);
    const months = validityToMonths(request.validity);

    // Build SAN entries
    const sanXml = (request.sans || [])
      .filter(san => san !== request.commonName)
      .map(san => `<SubjectAlternativeName>${san}</SubjectAlternativeName>`)
      .join('');

    // Build order XML based on certificate type
    let orderEndpoint: string;
    let orderXml: string;

    const baseOrderInfo = `
      <OrderRequestParameter>
        <ProductCode>${request.productCode}</ProductCode>
        <OrderKind>new</OrderKind>
        <Licenses>1</Licenses>
        <ValidityPeriod>
          <Months>${months}</Months>
        </ValidityPeriod>
        <CSR>${request.csr}</CSR>
        ${sanXml ? `<Options><Option><OptionName>SAN</OptionName><OptionValue>true</OptionValue></Option></Options>` : ''}
      </OrderRequestParameter>`;

    const contactInfo = request.contact ? `
      <ContactInfo>
        <FirstName>${request.contact.firstName}</FirstName>
        <LastName>${request.contact.lastName}</LastName>
        <Phone>${request.contact.phone || ''}</Phone>
        <Email>${request.contact.email}</Email>
      </ContactInfo>` : '';

    if (orderType === 'DV') {
      orderEndpoint = 'ServerSSLService';

      // DV uses URL/Email/DNS verification
      const approverEmail = request.validationEmail || `admin@${request.commonName.replace(/^\*\./, '')}`;

      orderXml = `
      <DVOrder>
        ${authBlock()}
        ${baseOrderInfo}
        ${contactInfo}
        <ApproverEmail>${approverEmail}</ApproverEmail>
        ${sanXml ? `<SANEntries>${sanXml}</SANEntries>` : ''}
      </DVOrder>`;

    } else if (orderType === 'OV') {
      orderEndpoint = 'ServerSSLService';

      const org = request.organization;
      orderXml = `
      <OVOrder>
        ${authBlock()}
        ${baseOrderInfo}
        <OrganizationInfo>
          <OrganizationName>${org?.name || ''}</OrganizationName>
          <OrganizationAddress>
            <AddressLine1>${org?.address || ''}</AddressLine1>
            <City>${org?.city || ''}</City>
            <Region>${org?.state || ''}</Region>
            <PostalCode></PostalCode>
            <Country>${org?.country || 'NG'}</Country>
            <Phone>${org?.phone || ''}</Phone>
          </OrganizationAddress>
        </OrganizationInfo>
        ${contactInfo}
        ${sanXml ? `<SANEntries>${sanXml}</SANEntries>` : ''}
      </OVOrder>`;

    } else {
      // EV
      orderEndpoint = 'ServerSSLService';

      const org = request.organization;
      orderXml = `
      <EVOrder>
        ${authBlock()}
        ${baseOrderInfo}
        <OrganizationInfo>
          <OrganizationName>${org?.name || ''}</OrganizationName>
          <OrganizationAddress>
            <AddressLine1>${org?.address || ''}</AddressLine1>
            <City>${org?.city || ''}</City>
            <Region>${org?.state || ''}</Region>
            <PostalCode></PostalCode>
            <Country>${org?.country || 'NG'}</Country>
            <Phone>${org?.phone || ''}</Phone>
          </OrganizationAddress>
          ${org?.registrationNo ? `
          <OrganizationCode>
            <Number>${org.registrationNo}</Number>
          </OrganizationCode>` : ''}
          <BusinessCategoryCode>PO</BusinessCategoryCode>
        </OrganizationInfo>
        ${contactInfo}
        ${sanXml ? `<SANEntries>${sanXml}</SANEntries>` : ''}
      </EVOrder>`;
    }

    const xml = await gsRequest(orderEndpoint, orderXml);

    const orderId = extractXmlValue(xml, 'OrderID');
    if (!orderId) {
      throw new Error('GlobalSign API did not return an OrderID');
    }

    logger.info(`GlobalSign ${orderType} order placed: ${orderId}`);

    // Extract approver emails if available
    const approverEmails: string[] = [];
    const approverBlock = extractXmlBlock(xml, 'Approvers');
    if (approverBlock) {
      const emails = approverBlock.match(/<Email>[^<]+<\/Email>/g);
      if (emails) {
        approverEmails.push(...emails.map(e => e.replace(/<\/?Email>/g, '')));
      }
    }

    return {
      caOrderId: orderId,
      status: 'pending',
      approverEmails: approverEmails.length ? approverEmails : undefined,
    };
  }

  async getOrderStatus(caOrderId: string): Promise<CAOrderStatus> {
    const xml = await gsRequest('ServerSSLService', `
      <GetOrderByOrderID>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
      </GetOrderByOrderID>`);

    const orderStatus = extractXmlValue(xml, 'OrderStatus') || 'UNKNOWN';
    const serialNumber = extractXmlValue(xml, 'SerialNumber');

    const result: CAOrderStatus = {
      caOrderId,
      status: normalizeStatus(orderStatus),
      caRawStatus: orderStatus,
    };

    // If issued, extract cert data
    if (normalizeStatus(orderStatus) === 'issued') {
      result.serialNumber = serialNumber || undefined;
      result.certificatePem = extractXmlValue(xml, 'X509Cert') ||
                               extractXmlValue(xml, 'CertificateInfo') || undefined;

      const beginCert = extractXmlValue(xml, 'BeginCert');
      const endCert = extractXmlValue(xml, 'EndCert');
      if (beginCert) result.issuedAt = new Date(beginCert);
      if (endCert) result.expiresAt = new Date(endCert);
    }

    return result;
  }

  async downloadCertificate(caOrderId: string): Promise<CACertificateDownload> {
    // GlobalSign returns the cert inline in GetOrderByOrderID
    const status = await this.getOrderStatus(caOrderId);

    if (status.status !== 'issued' || !status.certificatePem) {
      throw new Error('Certificate not yet issued by GlobalSign');
    }

    // Fetch full certificate with chain via separate call
    const xml = await gsRequest('ServerSSLService', `
      <GetOrderByOrderID>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
        <ReturnCertificateInfo>true</ReturnCertificateInfo>
      </GetOrderByOrderID>`);

    const certPem = extractXmlValue(xml, 'X509Cert') || status.certificatePem;
    const intermediatePem = extractXmlValue(xml, 'PKCS7Cert') ||
                            extractXmlValue(xml, 'IntermediateCA') || '';
    const serialNumber = extractXmlValue(xml, 'SerialNumber') || status.serialNumber || '';

    return {
      certificatePem: certPem,
      chainPem: intermediatePem,
      serialNumber,
      issuedAt: status.issuedAt || new Date(),
      expiresAt: status.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  async getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]> {
    // GlobalSign includes validation info in the order status response
    const xml = await gsRequest('ServerSSLService', `
      <GetOrderByOrderID>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
      </GetOrderByOrderID>`);

    const fulfillmentStatus = extractXmlValue(xml, 'OrderStatus') || '';
    const commonName = extractXmlValue(xml, 'CommonName') || '';

    // For DV certs, validation is tracked at the order level
    return [{
      domain: commonName,
      method: 'EMAIL',
      status: normalizeStatus(fulfillmentStatus) === 'issued' ? 'validated' : 'pending',
    }];
  }

  async triggerValidation(caOrderId: string, domain: string, method: string): Promise<void> {
    // GlobalSign DV validation is triggered at order time via approver email
    // For resend, use the ResendEmail API
    await gsRequest('ServerSSLService', `
      <ResendEmail>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
      </ResendEmail>`);

    logger.info(`GlobalSign validation email resent for order ${caOrderId}`);
  }

  async cancelOrder(caOrderId: string): Promise<void> {
    await gsRequest('ServerSSLService', `
      <ModifyOrder>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
        <ModifyOrderOperation>CANCEL</ModifyOrderOperation>
      </ModifyOrder>`);

    logger.info(`GlobalSign order cancelled: ${caOrderId}`);
  }

  async revokeCertificate(caOrderId: string, reason?: string): Promise<void> {
    await gsRequest('ServerSSLService', `
      <ModifyOrder>
        ${authBlock()}
        <OrderID>${caOrderId}</OrderID>
        <ModifyOrderOperation>REVOKE</ModifyOrderOperation>
      </ModifyOrder>`);

    logger.info(`GlobalSign certificate revoked for order: ${caOrderId}`);
  }

  async listProducts(): Promise<Array<{ code: string; name: string; type: string }>> {
    // GlobalSign products are fixed — return static list
    return [
      { code: 'DV_SHA2',    name: 'DomainSSL',       type: 'DV' },
      { code: 'DV_LOW',     name: 'AlphaSSL',        type: 'DV' },
      { code: 'OV_SHA2',    name: 'OrganizationSSL',  type: 'OV' },
      { code: 'EV_SHA2',    name: 'ExtendedSSL',      type: 'EV' },
    ];
  }
}
