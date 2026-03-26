/**
 * Dev Provider — Self-signed certificates via OpenSSL
 *
 * Used when no CA provider is configured or for local development.
 * Preserves the original self-signed certificate behavior.
 */

import { logger } from '../../utils/logger';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type {
  CAProvider, CAOrderRequest, CAOrderResponse, CAOrderStatus,
  CACertificateDownload, CAValidationStatus,
} from './index';

// In-memory store for dev orders (simulates CA state)
const devOrders: Map<string, { request: CAOrderRequest; status: string; certData?: CACertificateDownload }> = new Map();

export class DevProvider implements CAProvider {
  name = 'dev';

  async submitOrder(request: CAOrderRequest): Promise<CAOrderResponse> {
    const caOrderId = `DEV-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    devOrders.set(caOrderId, { request, status: 'pending' });

    logger.info(`[DEV] Order created: ${caOrderId} for ${request.commonName}`);

    // Auto-issue in dev mode (simulate instant DV issuance)
    setTimeout(() => this.autoIssue(caOrderId), 2000);

    return {
      caOrderId,
      status: 'pending',
      approverEmails: [`admin@${request.commonName.replace(/^\*\./, '')}`],
      validationDetails: [{
        method: 'EMAIL',
        domain: request.commonName,
        email: `admin@${request.commonName.replace(/^\*\./, '')}`,
      }],
    };
  }

  private async autoIssue(caOrderId: string): Promise<void> {
    const order = devOrders.get(caOrderId);
    if (!order) return;

    try {
      const certData = this.generateSelfSigned(order.request);
      order.status = 'issued';
      order.certData = certData;
      logger.info(`[DEV] Auto-issued certificate for order ${caOrderId}`);
    } catch (err) {
      logger.error(`[DEV] Auto-issue failed for ${caOrderId}:`, err);
      order.status = 'pending';
    }
  }

  private generateSelfSigned(request: CAOrderRequest): CACertificateDownload {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-dev-'));

    try {
      const commonName = (request.commonName || 'localhost').replace(/^\*\./, 'wildcard.');
      const sans = request.sans?.length ? request.sans : [request.commonName || 'localhost'];
      const validityDays = request.validity === 'THREE_YEARS' ? 1095
        : request.validity === 'TWO_YEARS' ? 730 : 365;

      const keyPath = path.join(tmpDir, 'key.pem');
      const csrPath = path.join(tmpDir, 'csr.pem');
      const certPath = path.join(tmpDir, 'cert.pem');
      const extPath = path.join(tmpDir, 'ext.cnf');

      // Build SAN extension file
      const sanList = sans.map((s: string, i: number) => `DNS.${i + 1} = ${s}`).join('\n');
      const extContent = `[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\n[v3_req]\nsubjectAltName = @alt_names\n[alt_names]\n${sanList}\n[SAN]\n${sanList}`;
      fs.writeFileSync(extPath, extContent);

      const orgName = request.organization?.name || 'CertPortal Dev';
      const country = request.organization?.country || 'NG';

      execSync(`openssl genrsa -out "${keyPath}" 2048 2>/dev/null`);
      execSync(`openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=${commonName}/O=${orgName}/C=${country}" 2>/dev/null`);
      execSync(`openssl x509 -req -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}" -days ${validityDays} -extensions SAN -extfile "${extPath}" 2>/dev/null`);

      const certPem = fs.readFileSync(certPath, 'utf8');

      const serialNumber = execSync(`openssl x509 -in "${certPath}" -serial -noout 2>/dev/null`)
        .toString().replace('serial=', '').trim();

      const notBeforeRaw = execSync(`openssl x509 -in "${certPath}" -noout -startdate 2>/dev/null`)
        .toString().replace('notBefore=', '').trim();
      const notAfterRaw = execSync(`openssl x509 -in "${certPath}" -noout -enddate 2>/dev/null`)
        .toString().replace('notAfter=', '').trim();

      const thumbprint = execSync(`openssl x509 -in "${certPath}" -fingerprint -sha1 -noout 2>/dev/null`)
        .toString().replace('SHA1 Fingerprint=', '').trim();

      return {
        certificatePem: certPem,
        chainPem: certPem, // Self-signed: chain = cert itself
        serialNumber,
        thumbprint,
        issuedAt: new Date(notBeforeRaw),
        expiresAt: new Date(notAfterRaw),
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async getOrderStatus(caOrderId: string): Promise<CAOrderStatus> {
    const order = devOrders.get(caOrderId);
    if (!order) {
      return { caOrderId, status: 'pending', caRawStatus: 'NOT_FOUND' };
    }

    return {
      caOrderId,
      status: order.status,
      caRawStatus: order.status.toUpperCase(),
      serialNumber: order.certData?.serialNumber,
      certificatePem: order.certData?.certificatePem,
      issuedAt: order.certData?.issuedAt,
      expiresAt: order.certData?.expiresAt,
    };
  }

  async downloadCertificate(caOrderId: string): Promise<CACertificateDownload> {
    const order = devOrders.get(caOrderId);
    if (!order?.certData) {
      throw new Error('[DEV] Certificate not yet generated');
    }
    return order.certData;
  }

  async getValidationStatus(caOrderId: string): Promise<CAValidationStatus[]> {
    const order = devOrders.get(caOrderId);
    if (!order) return [];

    return [{
      domain: order.request.commonName,
      method: 'EMAIL',
      status: order.status === 'issued' ? 'validated' : 'pending',
    }];
  }

  async triggerValidation(caOrderId: string, domain: string, method: string): Promise<void> {
    logger.info(`[DEV] Validation triggered for ${domain} (auto-approved)`);
    // Auto-approve in dev
    const order = devOrders.get(caOrderId);
    if (order && order.status === 'pending') {
      this.autoIssue(caOrderId);
    }
  }

  async cancelOrder(caOrderId: string): Promise<void> {
    const order = devOrders.get(caOrderId);
    if (order) order.status = 'cancelled';
    logger.info(`[DEV] Order cancelled: ${caOrderId}`);
  }

  async revokeCertificate(caOrderId: string, reason?: string): Promise<void> {
    const order = devOrders.get(caOrderId);
    if (order) order.status = 'revoked';
    logger.info(`[DEV] Certificate revoked: ${caOrderId}`);
  }

  async listProducts(): Promise<Array<{ code: string; name: string; type: string }>> {
    return [
      { code: 'DEV_DV', name: 'Dev DV SSL (self-signed)', type: 'DV' },
      { code: 'DEV_OV', name: 'Dev OV SSL (self-signed)', type: 'OV' },
      { code: 'DEV_EV', name: 'Dev EV SSL (self-signed)', type: 'EV' },
    ];
  }
}
