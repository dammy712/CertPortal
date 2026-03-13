import multer from 'multer';
import { BadRequestError } from '../utils/errors';

// Store in memory — we handle disk/S3 ourselves
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP and PDF files are allowed.'));
    }
  },
}).single('document');

// Wrap in a promise so we can use async/await
export const handleUpload = (req: any, res: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          reject(new BadRequestError('File size must be under 10MB.'));
        } else {
          reject(new BadRequestError(err.message));
        }
      } else if (err) {
        reject(new BadRequestError(err.message));
      } else {
        resolve();
      }
    });
  });
};
