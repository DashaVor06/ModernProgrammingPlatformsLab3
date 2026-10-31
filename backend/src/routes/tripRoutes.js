import express from 'express';
import { 
  listTrips, 
  getTripById, 
  createTrip, 
  updateTrip, 
  deleteTrip, 
  createTripSchema, 
  updateTripSchema 
} from '../controllers/tripController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// Public: browsing/searching trips is available without authentication
router.get('/', listTrips);
router.get('/:id', getTripById);

// Protected: trip management requires an authenticated Admin or Carrier
router.post('/', authenticateToken, requireRoles('ADMIN', 'CARRIER'), validate({ body: createTripSchema }), createTrip);
router.put('/:id', authenticateToken, requireRoles('ADMIN', 'CARRIER'), validate({ body: updateTripSchema }), updateTrip);
router.delete('/:id', authenticateToken, requireRoles('ADMIN', 'CARRIER'), deleteTrip);

export default router;
