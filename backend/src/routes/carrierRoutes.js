import express from 'express';
import { 
  listCarriers, 
  getCarrierById, 
  createCarrier, 
  updateCarrier, 
  deleteCarrier, 
  createCarrierSchema, 
  updateCarrierSchema 
} from '../controllers/carrierController.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/', listCarriers);
router.get('/:id', getCarrierById);

// Create carrier with logo & license upload (Admin only)
router.post(
  '/',
  authenticateToken,
  requireRoles('ADMIN'),
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'license', maxCount: 1 }]),
  validate({ body: createCarrierSchema }),
  createCarrier
);

// Update carrier with optional logo upload (Admin only)
router.put(
  '/:id',
  authenticateToken,
  requireRoles('ADMIN'),
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'license', maxCount: 1 }]),
  validate({ body: updateCarrierSchema }),
  updateCarrier
);

// Delete carrier (Admin only)
router.delete('/:id', authenticateToken, requireRoles('ADMIN'), deleteCarrier);

export default router;
