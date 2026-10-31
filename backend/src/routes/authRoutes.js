import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { loginBruteForceProtection } from '../middleware/rateLimiter.js';

const router = Router();

// Public auth routes
router.post('/register', authController.register);
router.post('/login', loginBruteForceProtection.checkLimit, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/recover-password', authController.recoverPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.me);
router.put('/me', authenticateToken, authController.updateProfile);

// Active connections (sessions) control
router.get('/sessions', authenticateToken, authController.listSessions);
router.delete('/sessions', authenticateToken, authController.terminateOtherSessions);
router.delete('/sessions/:sessionId', authenticateToken, authController.terminateSession);

// Admin only user management
router.get('/users', authenticateToken, requireRoles('ADMIN'), authController.listUsers);

export default router;
