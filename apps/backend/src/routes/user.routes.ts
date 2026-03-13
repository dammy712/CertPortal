import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ success: true, message: 'User service ready' });
});

export default router;
