import { execSync, execFileSync } from 'child_process';
import { BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ─── PRD 6.1 Supported Output Formats ─────────────────
// PFX/PKCS#12, P7B/PKCS#7, PEM, DER, CRT, CER
// Private keys are NEVER stored. All ops are in-memory (tmp dir).
// All artifacts deleted immediately after conversion.

export type ConversionFormat = 'PFX' | 'P7B' | 'PEM' | 'DER' | 'CRT' | 'CER';

export interface ConversionInput {
  certificate: string;       // PEM cert
  privateKey?: string;       // PEM key (required for PFX only)
  chain?: string;            // PEM intermediate chain (optional)
  targetFormat: ConversionFormat;
  pfxPassword?: string;      // Only for PFX output
}

// ─── Helpers ───────────────────────────────────────────

const makeTmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), `certconv-${crypto.randomBytes(4).toString('hex')}-`));

const cleanTmpDir = (dir: string) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    logger.warn(`Failed to clean tmp dir ${dir}:`, e);
  }
};

const validatePem = (pem: string, label: string) => {
  const cleaned = pem.trim();
  if (!cleaned.includes('-----BEGIN') || !cleaned.includes('-----END')) {
    throw new BadRequestError(`Invalid ${label}: must be a valid PEM-encoded block.`);
  }
  return cleaned;
};

// ─── Convert ───────────────────────────────────────────

export const convertCertificate = async (input: ConversionInput): Promise<{
  data: Buffer;
  filename: string;
  mimeType: string;
}> => {
  const { certificate, privateKey, chain, targetFormat, pfxPassword } = input;

  // Validate cert PEM
  validatePem(certificate, 'certificate');
  if (privateKey) validatePem(privateKey, 'private key');

  const tmpDir = makeTmpDir();

  try {
    const certFile  = path.join(tmpDir, 'cert.pem');
    const keyFile   = path.join(tmpDir, 'key.pem');
    const chainFile = path.join(tmpDir, 'chain.pem');
    const outFile   = path.join(tmpDir, 'output');

    fs.writeFileSync(certFile, certificate.trim() + '\n', { mode: 0o600 });
    if (privateKey) fs.writeFileSync(keyFile, privateKey.trim() + '\n', { mode: 0o600 });
    if (chain) fs.writeFileSync(chainFile, chain.trim() + '\n', { mode: 0o600 });

    // Verify the cert is readable
    try {
      execSync(`openssl x509 -in "${certFile}" -noout 2>/dev/null`, { timeout: 5000 });
    } catch {
      throw new BadRequestError('Certificate could not be parsed. Please ensure it is a valid PEM certificate.');
    }

    let outputBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    switch (targetFormat) {

      // ── PFX / PKCS#12 ─────────────────────────────────
      case 'PFX': {
        if (!privateKey) throw new BadRequestError('Private key is required for PFX/PKCS#12 conversion.');
        const password = pfxPassword || '';
        const pfxOut = `${outFile}.pfx`;
        const chainArg = chain ? `-certfile "${chainFile}"` : '';
        execSync(
          `openssl pkcs12 -export -out "${pfxOut}" -inkey "${keyFile}" -in "${certFile}" ${chainArg} -passout pass:"${password}" 2>/dev/null`,
          { timeout: 10000 }
        );
        outputBuffer = fs.readFileSync(pfxOut);
        filename = 'certificate.pfx';
        mimeType = 'application/x-pkcs12';
        break;
      }

      // ── P7B / PKCS#7 ──────────────────────────────────
      case 'P7B': {
        const p7bOut = `${outFile}.p7b`;
        const chainArg = chain ? `-certfile "${chainFile}"` : '';
        execSync(
          `openssl crl2pkcs7 -nocrl -certfile "${certFile}" ${chainArg} -out "${p7bOut}" 2>/dev/null`,
          { timeout: 10000 }
        );
        outputBuffer = fs.readFileSync(p7bOut);
        filename = 'certificate.p7b';
        mimeType = 'application/x-pkcs7-certificates';
        break;
      }

      // ── PEM ───────────────────────────────────────────
      case 'PEM': {
        // Return cert (+ chain if provided) as a single PEM bundle
        let pem = certificate.trim() + '\n';
        if (chain) pem += '\n' + chain.trim() + '\n';
        outputBuffer = Buffer.from(pem, 'utf8');
        filename = 'certificate.pem';
        mimeType = 'application/x-pem-file';
        break;
      }

      // ── DER ───────────────────────────────────────────
      case 'DER': {
        const derOut = `${outFile}.der`;
        execSync(
          `openssl x509 -in "${certFile}" -outform DER -out "${derOut}" 2>/dev/null`,
          { timeout: 10000 }
        );
        outputBuffer = fs.readFileSync(derOut);
        filename = 'certificate.der';
        mimeType = 'application/x-x509-ca-cert';
        break;
      }

      // ── CRT ───────────────────────────────────────────
      case 'CRT': {
        // CRT is PEM format with .crt extension
        outputBuffer = Buffer.from(certificate.trim() + '\n', 'utf8');
        filename = 'certificate.crt';
        mimeType = 'application/x-x509-ca-cert';
        break;
      }

      // ── CER ───────────────────────────────────────────
      case 'CER': {
        // CER is DER binary format with .cer extension
        const cerOut = `${outFile}.cer`;
        execSync(
          `openssl x509 -in "${certFile}" -outform DER -out "${cerOut}" 2>/dev/null`,
          { timeout: 10000 }
        );
        outputBuffer = fs.readFileSync(cerOut);
        filename = 'certificate.cer';
        mimeType = 'application/pkix-cert';
        break;
      }

      default:
        throw new BadRequestError(`Unsupported format: ${targetFormat}`);
    }

    logger.info(`Certificate converted to ${targetFormat} (${outputBuffer.length} bytes)`);
    return { data: outputBuffer, filename, mimeType };

  } finally {
    // PRD 6.1: All converted artifacts MUST be deleted after use
    cleanTmpDir(tmpDir);
  }
};

// ─── Parse/inspect a PEM cert (for UI preview) ────────

export const inspectCertificate = async (pem: string): Promise<{
  commonName: string;
  organization?: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  sans: string[];
  keyAlgorithm: string;
}> => {
  validatePem(pem, 'certificate');

  const tmpDir = makeTmpDir();
  try {
    const certFile = path.join(tmpDir, 'cert.pem');
    fs.writeFileSync(certFile, pem.trim() + '\n', { mode: 0o600 });

    const text = execSync(
      `openssl x509 -in "${certFile}" -noout -text 2>/dev/null`,
      { timeout: 5000, encoding: 'utf8' }
    );

    const subject    = text.match(/Subject:\s*(.+)/)?.[1] || '';
    const issuer     = text.match(/Issuer:\s*(.+)/)?.[1]?.trim() || 'Unknown';
    const notBefore  = text.match(/Not Before\s*:\s*(.+)/)?.[1]?.trim() || '';
    const notAfter   = text.match(/Not After\s*:\s*(.+)/)?.[1]?.trim() || '';
    const serial     = text.match(/Serial Number[\s\S]*?([0-9a-f:]{5,})/i)?.[1]?.trim() || '';
    const keyAlgo    = text.match(/Public Key Algorithm:\s*(.+)/)?.[1]?.trim() || 'Unknown';
    const sanMatches = [...text.matchAll(/DNS:([^\s,]+)/g)].map(m => m[1]);

    const cn  = subject.match(/CN\s*=\s*([^,\n]+)/)?.[1]?.trim() || '';
    const org = subject.match(/O\s*=\s*([^,\n]+)/)?.[1]?.trim();

    return { commonName: cn, organization: org, issuer, notBefore, notAfter, serialNumber: serial, sans: sanMatches, keyAlgorithm: keyAlgo };

  } finally {
    cleanTmpDir(tmpDir);
  }
};
