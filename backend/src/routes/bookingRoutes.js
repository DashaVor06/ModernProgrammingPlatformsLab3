import express from 'express';
import { 
  listBookings, 
  getBookingById, 
  createBooking, 
  updateBooking, 
  deleteBooking, 
  createBookingSchema, 
  updateBookingSchema 
} from '../controllers/bookingController.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Bookings contain personal data: require authentication for all access
router.get('/', authenticateToken, listBookings);
router.get('/:id', authenticateToken, getBookingById);

// Create booking with optional document upload (студенческий / удостоверение)
router.post(
  '/',
  authenticateToken,
  upload.single('document'),
  validate({ body: createBookingSchema }),
  createBooking
);

router.put('/:id', authenticateToken, validate({ body: updateBookingSchema }), updateBooking);
router.delete('/:id', authenticateToken, deleteBooking);

export default router;
