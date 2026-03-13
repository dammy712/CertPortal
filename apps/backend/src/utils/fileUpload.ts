import { logger } from './logger';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Local storage only — S3 can be wired in later when AWS keys are added
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const ensureDir = (subDir: string) => {
  const dir = path.join(LOCAL_UPLOAD_DIR, subDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const uploadFile = async (
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string
): Promise<{ key: string; url: string; size: number }> => {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(16).toString('hex');
  const key = `${folder}/${hash}${ext}`;
  const size = buffer.length;

  ensureDir(folder);
  const filePath = path.join(LOCAL_UPLOAD_DIR, folder, `${hash}${ext}`);
  fs.writeFileSync(filePath, buffer);

  logger.info(`File saved locally: ${filePath}`);
  return { key, url: `/uploads/${key}`, size };
};

export const getSignedUrl = async (key: string): Promise<string> => {
  // Local — return path directly
  return `http://localhost:5000/uploads/${key}`;
};

export const deleteFile = async (key: string): Promise<void> => {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info(`File deleted: ${filePath}`);
  }
};

export const validateFile = (
  mimeType: string,
  sizeBytes: number,
  maxMb = 10
): { valid: boolean; error?: string } => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(mimeType)) {
    return { valid: false, error: 'Only JPG, PNG, WEBP and PDF files are allowed.' };
  }
  if (sizeBytes > maxMb * 1024 * 1024) {
    return { valid: false, error: `File size must be under ${maxMb}MB.` };
  }
  return { valid: true };
};
