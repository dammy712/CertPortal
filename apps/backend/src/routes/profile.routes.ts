import { Router } from 'express';
import * as ProfileController from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/',                    ProfileController.getProfile);
router.patch('/',                  ProfileController.updateProfile);
router.post('/change-password',    ProfileController.changePassword);
router.patch('/preferences',       ProfileController.updatePreferences);
router.get('/sessions',            ProfileController.getSessions);
router.delete('/sessions/:id',     ProfileController.revokeSession);
router.delete('/sessions',         ProfileController.revokeAllSessions);
router.post('/change-email',       ProfileController.changeEmail);

export default router;
