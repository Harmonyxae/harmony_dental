import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, ensureTenantIsolation, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Get staff - REAL DATABASE
router.get('/', async (req: AuthRequest, res) => {
  try {
    const providers = await prisma.provider.findMany({
      where: { 
        tenantId: req.user!.tenantId,
        isActive: true 
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        schedulePreferences: true,
        isActive: true
      },
      orderBy: { lastName: 'asc' }
    });

    // Map to frontend format
    const staff = providers.map(provider => ({
      id: provider.id,
      name: `${provider.firstName} ${provider.lastName}`,
      role: provider.specialty || 'Doctor',
      firstName: provider.firstName,
      lastName: provider.lastName,
      specialty: provider.specialty,
      schedulePreferences: provider.schedulePreferences,
      isActive: provider.isActive
    }));

    res.json(staff);
  } catch (error) {
    console.error('Staff fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// Create staff member
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, specialty, schedulePreferences } = req.body;

    const provider = await prisma.provider.create({
      data: {
        tenantId: req.user!.tenantId,
        firstName,
        lastName,
        specialty,
        schedulePreferences: schedulePreferences || {}
      }
    });

    res.status(201).json({
      id: provider.id,
      name: `${provider.firstName} ${provider.lastName}`,
      role: provider.specialty || 'Doctor',
      firstName: provider.firstName,
      lastName: provider.lastName,
      specialty: provider.specialty
    });
  } catch (error) {
    console.error('Staff creation failed:', error);
    res.status(500).json({ error: 'Failed to create staff member' });
  }
});

export { router as staffRouter };