/**
 * CA Health Check Service
 *
 * Pings Certum and GlobalSign APIs on startup and every hour.
 * Products whose CA is unreachable or unconfigured are marked isActive=false
 * so they never appear in the shop.
 *
 * Rules:
 *  - caProvider = null or 'dev'       → always active (dev/self-signed)
 *  - caProvider = 'certum'            → active only if CERTUM_API_KEY is set AND API responds
 *  - caProvider = 'globalsign'        → active only if GLOBALSIGN_API_KEY is set AND API responds
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ─── CA Credential Checks ────────────────────────────────

const certumConfigured = (): boolean => {
  return !!(
    process.env.CERTUM_API_KEY?.trim() &&
    process.env.CERTUM_API_SECRET?.trim()
  );
};

const globalSignConfigured = (): boolean => {
  return !!(
    process.env.GLOBALSIGN_API_KEY?.trim() &&
    process.env.GLOBALSIGN_API_SECRET?.trim()
  );
};

// ─── CA Reachability Pings ───────────────────────────────

/**
 * Ping Certum API — call getProductList to verify credentials and connectivity.
 * Per docs (section 6.2): the WSDL URL IS the service endpoint.
 * Auth goes inside the request body as <requestHeader><authToken>, NOT in WS-Security headers.
 */
const pingCertum = async (): Promise<boolean> => {
  if (!certumConfigured()) {
    logger.warn('[CA Health] Certum credentials not configured — products will be hidden');
    return false;
  }

  // The WSDL URL is the service endpoint — do NOT strip .wsdl
  const endpoint = process.env.CERTUM_API_URL || 'https://gs.test.certum.pl/service/PartnerApi.wsdl';

  // Correct SOAP envelope per WSDL schema (tns namespace, document-style, password before userName)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://webservice.api.muc.unizeto.pl/">
  <soapenv:Body>
    <tns:getProductList>
      <requestHeader>
        <authToken>
          <password>${process.env.CERTUM_API_SECRET}</password>
          <userName>${process.env.CERTUM_API_KEY}</userName>
        </authToken>
      </requestHeader>
      <hashAlgorithm>false</hashAlgorithm>
    </tns:getProductList>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://webservice.api.muc.unizeto.pl/getProductList"',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();

    // successCode 0 = success, 1/3 = error — both mean the API is reachable
    // Error code 3 = wrong credentials, which still means the endpoint is live
    if (response.ok || response.status === 500) {
      const hasValidResponse = text.includes('getProductListResponse') ||
                               text.includes('successCode') ||
                               text.includes('responseHeader');
      if (hasValidResponse) {
        // Check for auth success (successCode 0)
        const isSuccess = text.includes('<successCode>0</successCode>') ||
                          text.includes('<ns2:successCode>0</ns2:successCode>');
        if (isSuccess) {
          logger.info('[CA Health] Certum API reachable and authenticated ✓');
          return true;
        }
        // Extract error code for better logging
        const errorMatch = text.match(/<errorCode>(\d+)<\/errorCode>/);
        const errorCode = errorMatch ? errorMatch[1] : 'unknown';
        logger.warn(`[CA Health] Certum API reachable but returned error code: ${errorCode} — check credentials`);
        return false;
      }
    }

    logger.warn(`[CA Health] Certum API responded with ${response.status}: ${text.substring(0, 200)}`);
    return false;

  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('[CA Health] Certum API timed out');
    } else {
      logger.warn(`[CA Health] Certum API unreachable: ${err.message}`);
    }
    return false;
  }
};

/**
 * Ping GlobalSign API — lightweight auth check.
 */
const pingGlobalSign = async (): Promise<boolean> => {
  if (!globalSignConfigured()) {
    logger.warn('[CA Health] GlobalSign credentials not configured — products will be hidden');
    return false;
  }

  const baseUrl = process.env.GLOBALSIGN_API_URL || 'https://testsystem.globalsign.com';

  const body = `<GetOrderCount>
  <AuthToken>
    <UserName>${process.env.GLOBALSIGN_API_KEY}</UserName>
    <Password>${process.env.GLOBALSIGN_API_SECRET}</Password>
  </AuthToken>
</GetOrderCount>`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${baseUrl}/kb/ws/v1/ServerSSLService`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // GlobalSign returns 200 even on auth errors — check response body
    const text = await response.text();

    // A valid response contains ResponseHeader — even error responses are reachable
    if (text.includes('ResponseHeader') || text.includes('ErrorCode')) {
      logger.info('[CA Health] GlobalSign API reachable ✓');
      return true;
    }

    logger.warn('[CA Health] GlobalSign API returned unexpected response');
    return false;

  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('[CA Health] GlobalSign API timed out');
    } else {
      logger.warn(`[CA Health] GlobalSign API unreachable: ${err.message}`);
    }
    return false;
  }
};

// ─── Apply Health Results to Product Catalog ─────────────

/**
 * Set isActive on all products based on their CA's health status.
 * Products with no caProvider (dev/null) are always active.
 */
const applyHealthStatus = async (
  certumOk: boolean,
  globalSignOk: boolean
): Promise<{ updated: number; certum: boolean; globalSign: boolean }> => {
  let updated = 0;

  // Update Certum products
  const certumResult = await prisma.certificateProduct.updateMany({
    where: { caProvider: 'certum' },
    data: { isActive: certumOk },
  });
  updated += certumResult.count;

  // Update GlobalSign products
  const globalSignResult = await prisma.certificateProduct.updateMany({
    where: { caProvider: 'globalsign' },
    data: { isActive: globalSignOk },
  });
  updated += globalSignResult.count;

  // Always ensure dev/null products are active (self-signed for local dev)
  await prisma.certificateProduct.updateMany({
    where: { OR: [{ caProvider: null }, { caProvider: 'dev' }] },
    data: { isActive: true },
  });

  logger.info(
    `[CA Health] Product catalog updated — Certum: ${certumOk ? '✓ active' : '✗ hidden'}, ` +
    `GlobalSign: ${globalSignOk ? '✓ active' : '✗ hidden'} (${updated} products affected)`
  );

  return { updated, certum: certumOk, globalSign: globalSignOk };
};

// ─── Main Health Check Runner ────────────────────────────

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

export const runCAHealthCheck = async (): Promise<{
  certum: boolean;
  globalSign: boolean;
  updated: number;
}> => {
  logger.info('[CA Health] Running CA health checks...');

  const [certumOk, globalSignOk] = await Promise.all([
    pingCertum(),
    pingGlobalSign(),
  ]);

  const result = await applyHealthStatus(certumOk, globalSignOk);

  return result;
};

/**
 * Start the health-check scheduler.
 * Runs immediately on boot, then every hour.
 */
export const startCAHealthCheck = (intervalMs = 60 * 60 * 1000) => {
  if (healthCheckTimer) return;

  // Run 5 seconds after boot (gives DB time to connect first)
  setTimeout(async () => {
    try {
      await runCAHealthCheck();
    } catch (err) {
      logger.error('[CA Health] Initial health check failed:', err);
    }
  }, 5_000);

  // Then repeat on interval (default: every hour)
  healthCheckTimer = setInterval(async () => {
    try {
      await runCAHealthCheck();
    } catch (err) {
      logger.error('[CA Health] Scheduled health check failed:', err);
    }
  }, intervalMs);

  logger.info(`[CA Health] Scheduler started — checking every ${intervalMs / 60000} min`);
};

export const stopCAHealthCheck = () => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
};

// ─── Admin: Get Current CA Status ───────────────────────

export const getCAStatus = async () => {
  const [certumCount, globalSignCount, certumActiveCount, globalSignActiveCount] =
    await Promise.all([
      prisma.certificateProduct.count({ where: { caProvider: 'certum' } }),
      prisma.certificateProduct.count({ where: { caProvider: 'globalsign' } }),
      prisma.certificateProduct.count({ where: { caProvider: 'certum', isActive: true } }),
      prisma.certificateProduct.count({ where: { caProvider: 'globalsign', isActive: true } }),
    ]);

  return {
    certum: {
      configured: certumConfigured(),
      productsTotal: certumCount,
      productsActive: certumActiveCount,
      online: certumActiveCount > 0,
    },
    globalSign: {
      configured: globalSignConfigured(),
      productsTotal: globalSignCount,
      productsActive: globalSignActiveCount,
      online: globalSignActiveCount > 0,
    },
  };
};