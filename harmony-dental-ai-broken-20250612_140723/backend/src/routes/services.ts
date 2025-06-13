import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, ensureTenantIsolation, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Get services - REAL DATABASE
router.get('/', async (req: AuthRequest, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { 
        tenantId: req.user!.tenantId,
        isActive: true 
      },
      orderBy: { name: 'asc' }
    });

    res.json(services);
  } catch (error) {
    console.error('Services fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Create service
router.post('/', async (req: AuthRequest, res) => {
  try {
    const service = await prisma.service.create({
      data: {
        tenantId: req.user!.tenantId,
        ...req.body
      }
    });

    res.status(201).json(service);
  } catch (error) {
    console.error('Service creation failed:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const service = await prisma.service.update({
      where: { 
        id: req.params.id,
        tenantId: req.user!.tenantId 
      },
      data: req.body
    });

    res.json(service);
  } catch (error) {
    console.error('Service update failed:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.service.update({
      where: { 
        id: req.params.id,
        tenantId: req.user!.tenantId 
      },
      data: { isActive: false }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Service deletion failed:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

export { router as servicesRouter };